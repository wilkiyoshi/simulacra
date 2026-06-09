/**
 * Reflection.ts
 * -------------
 * Implementa a Reflexão (Seção 4.2 do artigo). Periodicamente, o agente
 * sintetiza suas memórias brutas em crenças de alto nível ("inferências").
 *
 * Fluxo:
 *   1. Dispara quando a soma das importâncias das observações recentes
 *      ultrapassa um limiar (reflectionThreshold).
 *   2. Pergunta ao LLM quais as perguntas mais salientes sobre as memórias.
 *   3. Para cada pergunta, recupera memórias relevantes e pede ao LLM
 *      inferências de alto nível com as evidências que as sustentam.
 *   4. Grava as inferências de volta no Memory Stream como `reflection`.
 */
import type { MemoryStream } from './MemoryStream.js';
import type { PersonaCore } from './types.js';
import { retrieve } from './Retrieval.js';
import { complete, completeJSON } from '../llm/anthropic.js';

/** Limiar de importância acumulada que dispara uma reflexão. */
export const REFLECTION_THRESHOLD = 50;

interface ReflectionResult {
  insights: { insight: string; evidenceIndices: number[] }[];
}

export class Reflection {
  constructor(
    private readonly core: PersonaCore,
    private readonly memory: MemoryStream,
  ) {}

  /**
   * Executa um ciclo de reflexão. Retorna as descrições das novas crenças
   * geradas (vazio se nada relevante foi inferido).
   */
  async reflect(now: number): Promise<string[]> {
    const recent = this.memory
      .all()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    if (recent.length < 3) return [];

    // Passo 1: gerar perguntas de alto nível.
    const questions = await this.generateFocalQuestions(recent.map((m) => m.description));

    const created: string[] = [];

    // Passo 2 e 3: para cada pergunta, recuperar evidências e inferir.
    for (const question of questions.slice(0, 3)) {
      const relevant = await retrieve(this.memory.all(), question, now, 10);
      if (relevant.length === 0) continue;

      const evidenceList = relevant.map((r) => r.memory);
      const result = await this.synthesize(question, evidenceList.map((m) => m.description));

      for (const ins of result.insights) {
        const evidence = ins.evidenceIndices
          .map((i) => evidenceList[i]?.id)
          .filter((id): id is string => Boolean(id));

        const record = await this.memory.add('reflection', ins.insight, now, {
          evidence,
        });
        created.push(record.description);
      }
    }

    return created;
  }

  /** Passo 1: as 3 perguntas mais salientes sobre as memórias recentes. */
  private async generateFocalQuestions(descriptions: string[]): Promise<string[]> {
    const raw = await complete({
      system:
        `Você é ${this.core.name}. A partir de memórias recentes, identifique as ` +
        '3 perguntas mais relevantes de alto nível que podemos responder sobre ' +
        'os assuntos delas. Liste uma pergunta por linha, sem numeração.',
      prompt: descriptions.map((d) => `- ${d}`).join('\n'),
      deep: true,
      maxTokens: 256,
    });

    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter((l) => l.length > 0);
  }

  /** Passos 2-3: inferências de alto nível com índices das evidências. */
  private async synthesize(
    question: string,
    evidence: string[],
  ): Promise<ReflectionResult> {
    const numbered = evidence.map((e, i) => `${i}. ${e}`).join('\n');

    return completeJSON<ReflectionResult>({
      system:
        `Você é ${this.core.name} (${this.core.traits}). Sintetize inferências ` +
        'de alto nível sobre si mesmo e sobre os outros a partir das evidências. ' +
        'Para cada inferência cite os índices das evidências que a sustentam.',
      prompt:
        `Pergunta de foco: ${question}\n\nEvidências:\n${numbered}\n\n` +
        'Gere de 1 a 3 inferências.',
      deep: true,
      maxTokens: 512,
      schema: {
        type: 'object',
        properties: {
          insights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                insight: { type: 'string' },
                evidenceIndices: { type: 'array', items: { type: 'integer' } },
              },
              required: ['insight', 'evidenceIndices'],
              additionalProperties: false,
            },
          },
        },
        required: ['insights'],
        additionalProperties: false,
      },
    });
  }
}
