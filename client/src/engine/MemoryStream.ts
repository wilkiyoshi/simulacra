/**
 * MemoryStream.ts (navegador)  ★ MÓDULO CENTRAL ★
 * -----------------------------------------------
 * Fluxo de Memória do artigo de Stanford (Seção 4.1): registro abrangente, em
 * linguagem natural e com timestamp, das experiências de cada agente. Calcula
 * Importância (via LLM) e Embedding (relevância) de cada memória.
 */
import { nanoid } from 'nanoid';
import type { MemoryKind, MemoryRecord } from '../types';
import { complete } from './llm';
import { embed } from './embeddings';
import { insertMemoryRow, selectMemoriesByAgent, touchMemory } from './memoryStore';

export class MemoryStream {
  constructor(private readonly agentId: string) {}

  async add(
    kind: MemoryKind,
    description: string,
    now: number,
    options: { importance?: number; evidence?: string[] } = {},
  ): Promise<MemoryRecord> {
    const importance = options.importance ?? (await this.scoreImportance(description));
    const embedding = await embed(description);

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

  all(): MemoryRecord[] {
    return selectMemoriesByAgent(this.agentId);
  }

  importanceSince(sinceCreatedAt: number): number {
    return this.all()
      .filter((m) => m.kind === 'observation' && m.createdAt > sinceCreatedAt)
      .reduce((sum, m) => sum + m.importance, 0);
  }

  touch(ids: string[], now: number): void {
    for (const id of ids) touchMemory(id, now);
  }

  /** Pontua o quão marcante (poignant) é uma memória, de 1 a 10. */
  private async scoreImportance(description: string): Promise<number> {
    const raw = await complete({
      system:
        'Você avalia o quão marcante (poignant) é uma memória de uma persona. ' +
        'Responda APENAS com um inteiro de 1 (mundano) a 10 (marcante).',
      prompt: `Memória: "${description}"\nImportância (1-10)? Responda só o número.`,
      deep: false,
      maxTokens: 8,
    });
    const match = raw.match(/\d+/);
    const value = match ? Number(match[0]) : 5;
    return Math.min(10, Math.max(1, value));
  }
}
