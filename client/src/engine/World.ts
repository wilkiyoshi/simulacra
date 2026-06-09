/**
 * World.ts (navegador)
 * --------------------
 * Sandbox da simulação rodando no navegador: contexto global, grade espacial,
 * coleção de agentes e o loop de ticks. A cada tick, cada agente decide sua
 * ação, anda um passo, e pares adjacentes podem conversar. Emite snapshots
 * para os observadores (a cena Phaser, via store).
 */
import { nanoid } from 'nanoid';
import { GenerativeAgent } from './GenerativeAgent';
import type {
  AgentRuntimeState,
  Facing,
  PersonaInjection,
  Position,
  WorldContext,
  WorldSnapshot,
} from '../types';

export const GRID_WIDTH = 25;
export const GRID_HEIGHT = 18;
const INTERACTION_RADIUS = 1;

export type WorldListener = (snapshot: WorldSnapshot) => void;

export class World {
  private context: WorldContext = {
    description: 'Uma pacata vila litorânea com praça central, cafeteria e mercado.',
    weather: 'ensolarado',
    dayOfWeek: 'segunda-feira',
    rules: 'Os moradores são cordiais e seguem suas rotinas.',
    recentEvents: 'Nada de especial aconteceu recentemente.',
  };

  private readonly agents = new Map<string, GenerativeAgent>();
  private readonly listeners = new Set<WorldListener>();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepping = false;

  private simClock = Date.now();
  private readonly SIM_MINUTES_PER_TICK = 30;

  constructor(private readonly tickIntervalMs: number) {}

  getContext(): WorldContext {
    return this.context;
  }

  setContext(ctx: Partial<WorldContext>): void {
    this.context = { ...this.context, ...ctx };
    this.broadcast();
  }

  async addPersona(injection: PersonaInjection): Promise<AgentRuntimeState> {
    const id = nanoid();
    const spawn = injection.spawn ?? this.randomFreeTile();
    const agent = await GenerativeAgent.create(id, injection, spawn, this.simClock);
    this.agents.set(id, agent);
    for (const other of this.agents.values()) {
      if (other.id !== id) {
        await other.perceive(
          `${injection.core.name} (${injection.core.occupation}) chegou à cidade.`,
          this.simClock,
        );
      }
    }
    this.broadcast();
    return agent.toRuntimeState();
  }

  listAgents(): AgentRuntimeState[] {
    return [...this.agents.values()].map((a) => a.toRuntimeState());
  }

  subscribe(listener: WorldListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      context: this.context,
      agents: this.listAgents(),
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
    };
  }

  private broadcast(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.step(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async step(): Promise<void> {
    if (this.stepping || this.agents.size === 0) return;
    this.stepping = true;
    this.tick += 1;
    this.simClock += this.SIM_MINUTES_PER_TICK * 60 * 1000;

    try {
      const agents = [...this.agents.values()];
      for (const agent of agents) {
        const perception = this.describeSurroundings(agent);
        await agent.tick(this.context, perception, this.simClock);
        this.wander(agent);
      }
      await this.resolveInteractions(agents);
      this.broadcast();
      for (const agent of agents) agent.clearSpeech();
    } catch (err) {
      console.error('[World] erro no tick:', err);
    } finally {
      this.stepping = false;
    }
  }

  private async resolveInteractions(agents: GenerativeAgent[]): Promise<void> {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        if (this.distance(a.getPosition(), b.getPosition()) <= INTERACTION_RADIUS) {
          const line = await a.converse(b, this.simClock);
          if (line) await b.converse(a, this.simClock);
        }
      }
    }
  }

  private describeSurroundings(agent: GenerativeAgent): string {
    const pos = agent.getPosition();
    const nearby = [...this.agents.values()]
      .filter((o) => o.id !== agent.id && this.distance(pos, o.getPosition()) <= 3)
      .map((o) => `${o.core.name} (${o.core.occupation})`);
    const base = `Você está na cidade durante ${this.context.dayOfWeek}, clima ${this.context.weather}.`;
    return nearby.length > 0
      ? `${base} Por perto: ${nearby.join(', ')}.`
      : `${base} Não há ninguém por perto.`;
  }

  private wander(agent: GenerativeAgent): void {
    const pos = agent.getPosition();
    const moves: { d: Position; f: Facing }[] = [
      { d: { x: 0, y: -1 }, f: 'up' },
      { d: { x: 0, y: 1 }, f: 'down' },
      { d: { x: -1, y: 0 }, f: 'left' },
      { d: { x: 1, y: 0 }, f: 'right' },
      { d: { x: 0, y: 0 }, f: 'down' },
    ];
    const pick = moves[Math.floor(Math.random() * moves.length)];
    agent.setPosition(
      {
        x: clamp(pos.x + pick.d.x, 0, GRID_WIDTH - 1),
        y: clamp(pos.y + pick.d.y, 0, GRID_HEIGHT - 1),
      },
      pick.f,
    );
  }

  private randomFreeTile(): Position {
    return {
      x: Math.floor(Math.random() * GRID_WIDTH),
      y: Math.floor(Math.random() * GRID_HEIGHT),
    };
  }

  private distance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
