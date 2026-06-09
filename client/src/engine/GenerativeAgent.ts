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

  async perceive(observation: string, now: number): Promise<void> {
    await this.memory.add('observation', observation, now);
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
      await other.perceive(`${this.core.name} me disse: "${line}"`, now);
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
