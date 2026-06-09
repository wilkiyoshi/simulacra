/**
 * MemoryStream.ts  ★ MÓDULO CENTRAL ★
 * -----------------------------------
 * Implementa o "Memory Stream" do artigo de Stanford: um registro abrangente,
 * em linguagem natural e com carimbo de tempo, de tudo que um agente observou,
 * planejou ou refletiu.
 *
 * Responsabilidades:
 *   1. Persistir novas memórias (observações, reflexões, planos).
 *   2. Calcular a Importância (poignancy) de cada memória via LLM.
 *   3. Gerar o embedding de cada memória para a busca por Relevância.
 *   4. Servir as memórias para o algoritmo de Retrieval.
 *
 * A pontuação de Recuperação combina três fatores (Seção 4.1 do artigo):
 *      score = α·recência + β·importância + γ·relevância
 */
import { nanoid } from 'nanoid';
import type { MemoryKind, MemoryRecord } from './types.js';
import { complete } from '../llm/anthropic.js';
import { embeddings } from '../llm/embeddings.js';
import {
  insertMemoryRow,
  selectMemoriesByAgent,
  touchMemory,
} from '../db/database.js';

export class MemoryStream {
  constructor(private readonly agentId: string) {}

  /**
   * Adiciona uma memória ao fluxo. A importância é avaliada pelo LLM (a menos
   * que fornecida explicitamente, p.ex. para sementes do backstory) e o
   * embedding é calculado para habilitar a busca por relevância.
   *
   * @param now Relógio da simulação (epoch ms) no momento da criação.
   */
  async add(
    kind: MemoryKind,
    description: string,
    now: number,
    options: { importance?: number; evidence?: string[] } = {},
  ): Promise<MemoryRecord> {
    const importance =
      options.importance ?? (await this.scoreImportance(description));
    const embedding = await embeddings.embed(description);

    const record: MemoryRecord = {
      id: nanoid(),
      agentId: this.agentId,
      kind,
      description,
      createdAt: now,
      lastAccessedAt: now,
      importance,
      embedding,
      evidence: options.evidence,
    };

    insertMemoryRow(record);
    return record;
  }

  /** Carrega todas as memórias do agente (sem ranqueamento). */
  all(): MemoryRecord[] {
    return selectMemoriesByAgent(this.agentId);
  }

  /**
   * Soma das importâncias das observações desde um marco — usada pela
   * Reflexão para decidir quando "vale a pena" sintetizar (threshold do artigo).
   */
  importanceSince(sinceCreatedAt: number): number {
    return this.all()
      .filter((m) => m.kind === 'observation' && m.createdAt > sinceCreatedAt)
      .reduce((sum, m) => sum + m.importance, 0);
  }

  /** Marca memórias como recém-acessadas (afeta a Recência futura). */
  touch(ids: string[], now: number): void {
    for (const id of ids) touchMemory(id, now);
  }

  /**
   * Pergunta ao LLM o quão "marcante" (poignant) é uma memória, numa escala
   * de 1 (mundano: escovar os dentes) a 10 (marcante: pedido de casamento).
   * Espelha o prompt de importância da Seção 4.1 do artigo.
   */
  private async scoreImportance(description: string): Promise<number> {
    const raw = await complete({
      system:
        'Você avalia o quão marcante (poignant) é uma memória de uma persona. ' +
        'Responda APENAS com um número inteiro de 1 (totalmente mundano) a 10 ' +
        '(extremamente marcante).',
      prompt:
        `Memória: "${description}"\n` +
        'Numa escala de 1 a 10, qual a importância? Responda só o número.',
      deep: false,
      maxTokens: 8,
    });

    const match = raw.match(/\d+/);
    const value = match ? Number(match[0]) : 5;
    return Math.min(10, Math.max(1, value));
  }
}
