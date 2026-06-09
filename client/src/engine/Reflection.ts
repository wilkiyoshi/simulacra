/**
 * Reflection.ts (navegador)
 * -------------------------
 * Reflexão da Seção 4.2: periodicamente sintetiza memórias brutas em crenças
 * de alto nível, com as evidências que as sustentam.
 */
import type { MemoryStream } from './MemoryStream';
import type { PersonaCore } from '../types';
import { retrieve } from './Retrieval';
import { complete, completeJSON } from './llm';

export const REFLECTION_THRESHOLD = 50;

interface ReflectionResult {
  insights: { insight: string; evidenceIndices: number[] }[];
}

export class Reflection {
  constructor(
    private readonly core: PersonaCore,
    private readonly memory: MemoryStream,
  ) {}

  async reflect(now: number): Promise<string[]> {
    const recent = this.memory
      .all()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    if (recent.length < 3) return [];

    const questions = await this.generateFocalQuestions(recent.map((m) => m.description));
    const created: string[] = [];

    for (const question of questions.slice(0, 3)) {
      const relevant = await retrieve(this.memory.all(), question, now, 10);
      if (relevant.length === 0) continue;

      const evidenceList = relevant.map((r) => r.memory);
      const result = await this.synthesize(question, evidenceList.map((m) => m.description));

      for (const ins of result.insights ?? []) {
        const evidence = ins.evidenceIndices
          .map((i) => evidenceList[i]?.id)
          .filter((id): id is string => Boolean(id));
        const record = await this.memory.add('reflection', ins.insight, now, { evidence });
        created.push(record.description);
      }
    }
    return created;
  }

  private async generateFocalQuestions(descriptions: string[]): Promise<string[]> {
    const raw = await complete({
      system:
        `Você é ${this.core.name}. A partir das memórias recentes, liste as 3 ` +
        'perguntas mais relevantes de alto nível. Uma por linha, sem numeração.',
      prompt: descriptions.map((d) => `- ${d}`).join('\n'),
      deep: true,
      maxTokens: 256,
    });
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter((l) => l.length > 0);
  }

  private async synthesize(question: string, evidence: string[]): Promise<ReflectionResult> {
    const numbered = evidence.map((e, i) => `${i}. ${e}`).join('\n');
    return completeJSON<ReflectionResult>({
      system:
        `Você é ${this.core.name} (${this.core.traits}). Sintetize inferências de ` +
        'alto nível sobre si e sobre os outros, citando os índices das evidências.',
      prompt: `Pergunta de foco: ${question}\n\nEvidências:\n${numbered}\n\nGere de 1 a 3 inferências.`,
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
            },
          },
        },
        required: ['insights'],
      },
    });
  }
}
