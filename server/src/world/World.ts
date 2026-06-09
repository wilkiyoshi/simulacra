/**
 * World.ts
 * --------
 * O "sandbox" da simulação. Mantém o contexto global, a grade espacial e a
 * coleção de agentes. Roda o loop de ticks: a cada intervalo, percorre os
 * agentes, faz cada um decidir sua ação, detecta proximidade entre eles
 * (gatilho para conversas) e emite o novo estado para os observadores.
 */
import { nanoid } from 'nanoid';
import { GenerativeAgent } from '../cognition/GenerativeAgent.js';
import type {
  AgentRuntimeState,
  Facing,
  PersonaInjection,
  Position,
  WorldContext,
} from '../cognition/types.js';

/** Dimensões da grade de tiles (mapa da cidade). */
export const GRID_WIDTH = 25;
export const GRID_HEIGHT = 18;

/** Distância (em tiles) que dispara uma interação entre dois agentes. */
const INTERACTION_RADIUS = 1;

export type WorldListener = (snapshot: WorldSnapshot) => void;

export interface WorldSnapshot {
  tick: number;
  context: WorldContext;
  agents: AgentRuntimeState[];
  width: number;
  height: number;
}

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
  private timer: NodeJS.Timeout | null = null;
  /** Evita ticks concorrentes enquanto chamadas ao LLM estão em voo. */
  private stepping = false;

  // --- Relógio da simulação -------------------------------------------------
  // Avança ~30 min de tempo simulado por tick para dar sensação de rotina.
  private simClock = Date.now();
  private readonly SIM_MINUTES_PER_TICK = 30;

  constructor(private readonly tickIntervalMs: number) {}

  // --- Contexto global ------------------------------------------------------

  getContext(): WorldContext {
    return this.context;
  }

  setContext(ctx: Partial<WorldContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  // --- Gestão de agentes ----------------------------------------------------

  async addPersona(injection: PersonaInjection): Promise<AgentRuntimeState> {
    const id = nanoid();
    const spawn = injection.spawn ?? this.randomFreeTile();
    const agent = await GenerativeAgent.create(id, injection, spawn, this.simClock);
    this.agents.set(id, agent);
    // Os demais moradores percebem a chegada do novo habitante.
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

  // --- Observadores (Socket.IO) ---------------------------------------------

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

  // --- Loop de simulação ----------------------------------------------------

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.step(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Um passo completo da simulação. */
  private async step(): Promise<void> {
    if (this.stepping || this.agents.size === 0) return;
    this.stepping = true;
    this.tick += 1;
    this.simClock += this.SIM_MINUTES_PER_TICK * 60 * 1000;

    try {
      const agents = [...this.agents.values()];

      // 1. Cada agente decide sua próxima ação e se move um passo.
      for (const agent of agents) {
        const perception = this.describeSurroundings(agent);
        await agent.tick(this.context, perception, this.simClock);
        this.wander(agent);
      }

      // 2. Detecção de proximidade -> conversas (reação a evento inesperado).
      await this.resolveInteractions(agents);

      this.broadcast();

      // 3. Balões de fala somem após um tick.
      for (const agent of agents) agent.clearSpeech();
    } catch (err) {
      console.error('[World] erro no tick:', err);
    } finally {
      this.stepping = false;
    }
  }

  /** Pares de agentes adjacentes têm a chance de conversar. */
  private async resolveInteractions(agents: GenerativeAgent[]): Promise<void> {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        if (this.distance(a.getPosition(), b.getPosition()) <= INTERACTION_RADIUS) {
          // 'a' inicia; se falar, 'b' pode responder.
          const line = await a.converse(b, this.simClock);
          if (line) await b.converse(a, this.simClock);
        }
      }
    }
  }

  /** Descreve o que o agente vê ao redor (alimenta a decisão de ação). */
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

  // --- Movimento simples (passeio aleatório com viés) -----------------------

  private wander(agent: GenerativeAgent): void {
    const pos = agent.getPosition();
    const moves: { d: Position; f: Facing }[] = [
      { d: { x: 0, y: -1 }, f: 'up' },
      { d: { x: 0, y: 1 }, f: 'down' },
      { d: { x: -1, y: 0 }, f: 'left' },
      { d: { x: 1, y: 0 }, f: 'right' },
      { d: { x: 0, y: 0 }, f: 'down' }, // ficar parado
    ];
    const pick = moves[Math.floor(Math.random() * moves.length)];
    const next: Position = {
      x: clamp(pos.x + pick.d.x, 0, GRID_WIDTH - 1),
      y: clamp(pos.y + pick.d.y, 0, GRID_HEIGHT - 1),
    };
    agent.setPosition(next, pick.f);
  }

  private randomFreeTile(): Position {
    return {
      x: Math.floor(Math.random() * GRID_WIDTH),
      y: Math.floor(Math.random() * GRID_HEIGHT),
    };
  }

  private distance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
