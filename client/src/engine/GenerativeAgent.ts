/**
 * GenerativeAgent.ts (navegador)  ★ MÓDULO CENTRAL ★
 * --------------------------------------------------
 * Integra Memory Stream, Retrieval, Reflection e Planning numa persona viva
 * (Figura 2 do artigo). Idêntico ao backend, mas roda no navegador.
 */
import type {
  AgentRuntimeState,
  Facing,
  PersonaCore,
  PersonaInjection,
  Position,
} from '../types';
import { MemoryStream } from './MemoryStream';
import { Reflection, REFLECTION_THRESHOLD } from './Reflection';
import { Planning, type TickDecision } from './Planning';
import { completeJSON } from './llm';
import { hasLLM } from '../store/useSettings';
import type { WorldContext } from '../types';

export class GenerativeAgent {
  readonly id: string;
  readonly core: PersonaCore;

  private readonly memory: MemoryStream;
  private readonly reflection: Reflection;
  private readonly planning: Planning;

  private position: Position;
  private facing: Facing = 'down';
  private currentAction = 'ocioso';
  private actionEmoji = '🙂';
  private speech: string | null = null;
  private isMoving = false;

  private dailyPlan: string[] = [];
  private lastReflectionAt = 0;
  private readonly relationships = new Map<string, string>();

  constructor(id: string, core: PersonaCore, spawn: Position) {
    this.id = id;
    this.core = core;
    this.position = spawn;
    this.memory = new MemoryStream(id);
    this.reflection = new Reflection(core, this.memory);
    this.planning = new Planning(core, this.memory);
  }

  static async create(
    id: string,
    injection: PersonaInjection,
    fallbackSpawn: Position,
    now: number,
  ): Promise<GenerativeAgent> {
    const agent = new GenerativeAgent(id, injection.core, injection.spawn ?? fallbackSpawn);
    await agent.seed(injection, now);
    return agent;
  }

  private async seed(injection: PersonaInjection, now: number): Promise<void> {
    for (const fact of injection.backstory) {
      await this.memory.add('observation', fact, now, { importance: 7 });
    }
    for (const rel of injection.relationships) {
      await this.memory.add('observation', rel, now, { importance: 6 });
      const nameMatch = rel.match(/\b[A-ZÀ-Ý][a-zà-ÿ]+\b/);
      if (nameMatch) this.relationships.set(nameMatch[0], rel);
    }
    this.lastReflectionAt = now;
  }

  async planDay(world: WorldContext, now: number): Promise<void> {
    this.dailyPlan = await this.planning.dailyPlan(world, now);
    await this.memory.add('plan', `Plano do dia: ${this.dailyPlan.join('; ')}`, now, {
      importance: 6,
    });
  }

  async tick(world: WorldContext, perception: string, now: number): Promise<void> {
    if (this.dailyPlan.length === 0) await this.planDay(world, now);

    const decision: TickDecision = await this.planning.decideAction(
      world,
      this.dailyPlan,
      perception,
      now,
    );
    this.applyDecision(decision);
    await this.memory.add('observation', `Eu estou ${decision.action}.`, now);

    if (this.memory.importanceSince(this.lastReflectionAt) >= REFLECTION_THRESHOLD) {
      await this.reflection.reflect(now);
      this.lastReflectionAt = now;
    }
  }

  async perceive(observation: string, now: number, importance?: number): Promise<void> {
    await this.memory.add('observation', observation, now, importance !== undefined ? { importance } : {});
  }

  async converse(other: GenerativeAgent, now: number): Promise<string | null> {
    const hint =
      this.relationships.get(other.core.name) ?? `Você não conhece bem ${other.core.name}.`;
    const line = await this.planning.react(other.core.name, hint, now);
    if (line) {
      this.speech = line;
      await this.memory.add('observation', `Eu disse para ${other.core.name}: "${line}"`, now, {
        importance: 4,
      });
      await other.perceive(`${this.core.name} me disse: "${line}"`, now, 4);
    }
    return line;
  }

  setPosition(pos: Position, facing: Facing): void {
    this.facing = facing;
    this.isMoving = pos.x !== this.position.x || pos.y !== this.position.y;
    this.position = pos;
  }

  getPosition(): Position {
    return this.position;
  }

  clearSpeech(): void {
    this.speech = null;
  }

  setSpeech(text: string | null): void {
    this.speech = text;
  }

  /**
   * Gera um pequeno diálogo (2 a 4 falas) entre este twin e `other` numa única
   * chamada ao LLM. Registra as falas na memória de ambos e devolve a sequência
   * para o World exibir nos balões.
   */
  async dialogueWith(
    other: GenerativeAgent,
    now: number,
  ): Promise<{ who: 'self' | 'other'; text: string }[]> {
    const hint =
      this.relationships.get(other.core.name) ??
      other.relationships.get(this.core.name) ??
      'não se conhecem bem.';

    let lines: { who: 'A' | 'B'; text: string }[];
    if (!hasLLM()) {
      lines = [
        { who: 'A', text: `Oi, ${other.core.name}! Tudo bem?` },
        { who: 'B', text: `Tudo certo, ${this.core.name}! Bom te ver.` },
      ];
    } else {
      try {
        const res = await completeJSON<{ lines: { who: string; text: string }[] }>({
          system:
            'Você escreve um diálogo curto, natural e coloquial em português brasileiro ' +
            'entre dois moradores que se cruzam na rua. 2 a 4 falas curtas, alternadas, ' +
            'começando por A. Mantenha coerência com a personalidade de cada um.',
          prompt:
            `A = ${this.core.name} (${this.core.occupation}); traços: ${this.core.traits}.\n` +
            `B = ${other.core.name} (${other.core.occupation}); traços: ${other.core.traits}.\n` +
            `Relação: ${hint}\n\nGere o diálogo.`,
          deep: false,
          maxTokens: 300,
          schema: {
            type: 'object',
            properties: {
              lines: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { who: { type: 'string', enum: ['A', 'B'] }, text: { type: 'string' } },
                  required: ['who', 'text'],
                },
              },
            },
            required: ['lines'],
          },
        });
        lines = (res.lines ?? []).slice(0, 4).map((l) => ({ who: /^a/i.test(l.who) ? 'A' : 'B', text: l.text }));
        if (lines.length === 0) throw new Error('vazio');
      } catch {
        lines = [{ who: 'A', text: `Olá, ${other.core.name}!` }];
      }
    }

    const out: { who: 'self' | 'other'; text: string }[] = [];
    for (const l of lines) {
      const speaker = l.who === 'A' ? this : other;
      const listener = l.who === 'A' ? other : this;
      await speaker.perceive(`Eu disse para ${listener.core.name}: "${l.text}"`, now, 4);
      await listener.perceive(`${speaker.core.name} me disse: "${l.text}"`, now, 4);
      out.push({ who: l.who === 'A' ? 'self' : 'other', text: l.text });
    }
    return out;
  }

  private applyDecision(decision: TickDecision): void {
    this.currentAction = decision.action;
    this.actionEmoji = decision.emoji || '🙂';
    this.speech = decision.speech;
  }

  toRuntimeState(): AgentRuntimeState {
    return {
      id: this.id,
      core: this.core,
      position: this.position,
      facing: this.facing,
      currentAction: this.currentAction,
      actionEmoji: this.actionEmoji,
      speech: this.speech,
      isMoving: this.isMoving,
    };
  }
}
