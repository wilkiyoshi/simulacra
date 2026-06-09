/**
 * Planning.ts (navegador)
 * -----------------------
 * Planejamento e Reação da Seção 4.3: plano diário (Opus), ação por tick
 * (Haiku) e reação a encontros inesperados.
 */
import type { MemoryStream } from './MemoryStream';
import type { PersonaCore, WorldContext } from '../types';
import { retrieve } from './Retrieval';
import { complete, completeJSON } from './llm';

export interface TickDecision {
  action: string;
  emoji: string;
  speech: string | null;
}

export class Planning {
  constructor(
    private readonly core: PersonaCore,
    private readonly memory: MemoryStream,
  ) {}

  private identity(): string {
    return (
      `Você é ${this.core.name}, ${this.core.age} anos, ${this.core.occupation}. ` +
      `Traços: ${this.core.traits}. Aparência: ${this.core.appearance}.`
    );
  }

  async dailyPlan(world: WorldContext, now: number): Promise<string[]> {
    const relevant = await retrieve(this.memory.all(), 'meus planos e rotina', now, 6);
    const raw = await complete({
      system: this.identity(),
      prompt:
        `Contexto da cidade: ${world.description}\n` +
        `Hoje é ${world.dayOfWeek}, clima ${world.weather}.\n` +
        `Regras: ${world.rules}\nEventos recentes: ${world.recentEvents}\n\n` +
        `Memórias relevantes:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\n` +
        'Esboce seu dia em 5 a 8 itens, um por linha, em ordem cronológica.',
      deep: true,
      maxTokens: 512,
    });
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter((l) => l.length > 0);
  }

  async decideAction(
    world: WorldContext,
    dailyPlan: string[],
    perception: string,
    now: number,
  ): Promise<TickDecision> {
    const relevant = await retrieve(this.memory.all(), perception, now, 6);
    this.memory.touch(relevant.map((r) => r.memory.id), now);

    return completeJSON<TickDecision>({
      system: this.identity() + ' Decida sua próxima ação imediata, coerente com a rotina e a personalidade.',
      prompt:
        `Cidade: ${world.description}. Clima: ${world.weather}. Eventos: ${world.recentEvents}.\n` +
        `Roteiro de hoje:\n${dailyPlan.map((p) => `- ${p}`).join('\n')}\n\n` +
        `Memórias relevantes agora:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\n` +
        `O que você percebe: ${perception}\n\nEscolha UMA ação curta e concreta.`,
      deep: false,
      maxTokens: 256,
      schema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          emoji: { type: 'string' },
          speech: { type: ['string', 'null'] },
        },
        required: ['action', 'emoji', 'speech'],
      },
    });
  }

  async react(observedAgentName: string, relationshipHint: string, now: number): Promise<string | null> {
    const context = `Encontrei ${observedAgentName}.`;
    const relevant = await retrieve(this.memory.all(), context, now, 5);
    const raw = await complete({
      system:
        this.identity() +
        ' Você se deparou com outra pessoa. Diga UMA frase curta e natural, ou responda exatamente "[silêncio]".',
      prompt:
        `Você encontrou ${observedAgentName}. ${relationshipHint}\n` +
        `Memórias relevantes:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\nO que você diz?`,
      deep: false,
      maxTokens: 128,
    });
    const text = raw.trim();
    if (!text || /\[sil[êe]ncio\]/i.test(text)) return null;
    return text.replace(/^["']|["']$/g, '');
  }
}
