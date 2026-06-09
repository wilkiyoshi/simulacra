/**
 * Planning.ts
 * -----------
 * Implementa Planejamento e Reação (Seção 4.3 do artigo).
 *
 *   - `dailyPlan`: traduz personalidade + contexto global em um roteiro de
 *     alto nível para o dia (lista de intenções ordenadas).
 *   - `decideAction`: a cada tick, escolhe a próxima ação detalhada, dado o
 *     plano, as memórias relevantes e o que o agente percebe agora.
 *   - `react`: ao perceber um evento inesperado (outro agente por perto),
 *     decide se mantém o plano ou reage (ex.: iniciar uma conversa).
 */
import type { MemoryStream } from './MemoryStream.js';
import type { PersonaCore, WorldContext } from './types.js';
import { retrieve } from './Retrieval.js';
import { complete, completeJSON } from '../llm/anthropic.js';

export interface TickDecision {
  /** Ação em linguagem natural ("preparando o café da manhã"). */
  action: string;
  /** Emoji curto para o HUD/balão. */
  emoji: string;
  /** Se o agente quer falar agora, o texto do balão; senão null. */
  speech: string | null;
}

export class Planning {
  constructor(
    private readonly core: PersonaCore,
    private readonly memory: MemoryStream,
  ) {}

  /** Identidade resumida reutilizada em todos os prompts deste agente. */
  private identity(): string {
    return (
      `Você é ${this.core.name}, ${this.core.age} anos, ${this.core.occupation}. ` +
      `Traços: ${this.core.traits}. Aparência: ${this.core.appearance}.`
    );
  }

  /** Gera o roteiro de alto nível do dia (5 a 8 itens). */
  async dailyPlan(world: WorldContext, now: number): Promise<string[]> {
    const relevant = await retrieve(this.memory.all(), 'meus planos e rotina', now, 6);

    const raw = await complete({
      system: this.identity(),
      prompt:
        `Contexto da cidade: ${world.description}\n` +
        `Hoje é ${world.dayOfWeek}, clima ${world.weather}.\n` +
        `Regras: ${world.rules}\n` +
        `Eventos recentes: ${world.recentEvents}\n\n` +
        `Memórias relevantes:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\n` +
        'Esboce um roteiro do seu dia em 5 a 8 itens, um por linha, em ordem cronológica.',
      deep: true,
      maxTokens: 512,
    });

    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter((l) => l.length > 0);
  }

  /**
   * Decide a ação detalhada do próximo tick. Combina o plano diário, as
   * memórias relevantes ao momento e a percepção imediata (vizinhança).
   */
  async decideAction(
    world: WorldContext,
    dailyPlan: string[],
    perception: string,
    now: number,
  ): Promise<TickDecision> {
    const relevant = await retrieve(this.memory.all(), perception, now, 6);
    // Memórias acessadas reforçam sua recência.
    this.memory.touch(relevant.map((r) => r.memory.id), now);

    return completeJSON<TickDecision>({
      system:
        this.identity() +
        ' Decida sua próxima ação imediata de forma coerente com sua rotina e personalidade.',
      prompt:
        `Cidade: ${world.description}. Clima: ${world.weather}. Eventos: ${world.recentEvents}.\n` +
        `Seu roteiro de hoje:\n${dailyPlan.map((p) => `- ${p}`).join('\n')}\n\n` +
        `Memórias relevantes agora:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\n` +
        `O que você percebe neste instante: ${perception}\n\n` +
        'Escolha UMA ação curta e concreta para os próximos minutos.',
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
        additionalProperties: false,
      },
    });
  }

  /**
   * Reage a um evento inesperado. Retorna uma fala se o agente decidir
   * interagir, ou null se preferir manter o plano corrente.
   */
  async react(
    observedAgentName: string,
    relationshipHint: string,
    now: number,
  ): Promise<string | null> {
    const context = `Encontrei ${observedAgentName}.`;
    const relevant = await retrieve(this.memory.all(), context, now, 5);

    const raw = await complete({
      system:
        this.identity() +
        ' Você acabou de se deparar com outra pessoa. Decida o que dizer em UMA frase curta e natural, ou responda exatamente "[silêncio]" se preferir não falar.',
      prompt:
        `Você encontrou ${observedAgentName}. ${relationshipHint}\n` +
        `Memórias relevantes:\n${relevant.map((r) => `- ${r.memory.description}`).join('\n')}\n\n` +
        'O que você diz?',
      deep: false,
      maxTokens: 128,
    });

    const text = raw.trim();
    if (!text || /\[sil[êe]ncio\]/i.test(text)) return null;
    return text.replace(/^["']|["']$/g, '');
  }
}
