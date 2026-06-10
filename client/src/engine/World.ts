/**
 * World.ts (navegador)
 * --------------------
 * Sandbox da simulação no navegador: contexto global, grade espacial, agentes
 * e o loop de ticks. A cada tick os digital twins decidem ações, andam (com
 * leve atração social para se encontrarem) e pares próximos conversam — gerando
 * balões de fala. Também mantém um log de eventos que alimenta os Insights.
 */
import { nanoid } from 'nanoid';
import { GenerativeAgent } from './GenerativeAgent';
import { cityMap } from '../city/map';
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
/** Distância (Manhattan) que dispara uma interação entre dois twins. */
const INTERACTION_RADIUS = 2;
/** Máximo de conversas iniciadas por tick (controla custo de LLM). */
const MAX_CONVERSATIONS_PER_TICK = 2;

export type WorldListener = (snapshot: WorldSnapshot) => void;

/** Evento observável da cidade (para o módulo de Insights). */
export interface WorldEvent {
  tick: number;
  kind: 'action' | 'talk';
  text: string;
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
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepping = false;

  private simClock = Date.now();
  private readonly SIM_MINUTES_PER_TICK = 30;

  /** Buffer de eventos recentes consumido pelo observador de Insights. */
  private events: WorldEvent[] = [];

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
    const spawn = injection.spawn ?? cityMap.randomSpawn();
    const agent = await GenerativeAgent.create(id, injection, spawn, this.simClock);
    this.agents.set(id, agent);
    for (const other of this.agents.values()) {
      if (other.id !== id) {
        await other.perceive(
          `${injection.core.name} (${injection.core.occupation}) chegou à cidade.`,
          this.simClock,
          4,
        );
      }
    }
    this.pushEvent('action', `${injection.core.name} chegou à cidade.`);
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

  /** Retorna e limpa o buffer de eventos (consumido pelo observador). */
  takeEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private pushEvent(kind: WorldEvent['kind'], text: string): void {
    this.events.push({ tick: this.tick, kind, text });
    if (this.events.length > 250) this.events.splice(0, this.events.length - 250);
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
        this.move(agent, agents);
        this.pushEvent('action', `${agent.core.name}: ${agent.toRuntimeState().currentAction}`);
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

  /** Pares próximos conversam (limitado por tick); registra os diálogos. */
  private async resolveInteractions(agents: GenerativeAgent[]): Promise<void> {
    let conversations = 0;
    const talked = new Set<string>();
    for (let i = 0; i < agents.length && conversations < MAX_CONVERSATIONS_PER_TICK; i++) {
      for (let j = i + 1; j < agents.length && conversations < MAX_CONVERSATIONS_PER_TICK; j++) {
        const a = agents[i];
        const b = agents[j];
        if (talked.has(a.id) || talked.has(b.id)) continue;
        if (this.distance(a.getPosition(), b.getPosition()) <= INTERACTION_RADIUS) {
          const line = await a.converse(b, this.simClock);
          if (!line) continue;
          this.pushEvent('talk', `${a.core.name} → ${b.core.name}: "${line}"`);
          talked.add(a.id);
          const reply = await b.converse(a, this.simClock);
          if (reply) this.pushEvent('talk', `${b.core.name} → ${a.core.name}: "${reply}"`);
          talked.add(b.id);
          conversations += 1;
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

  /** Passos válidos a partir de `pos` (apenas tiles caminháveis = física). */
  private steps(pos: Position): { to: Position; facing: Facing; road: boolean }[] {
    const opts: { d: Position; f: Facing }[] = [
      { d: { x: 0, y: -1 }, f: 'up' },
      { d: { x: 0, y: 1 }, f: 'down' },
      { d: { x: -1, y: 0 }, f: 'left' },
      { d: { x: 1, y: 0 }, f: 'right' },
    ];
    const res: { to: Position; facing: Facing; road: boolean }[] = [];
    for (const o of opts) {
      const nx = pos.x + o.d.x;
      const ny = pos.y + o.d.y;
      if (cityMap.isWalkable(nx, ny)) {
        res.push({ to: { x: nx, y: ny }, facing: o.f, road: cityMap.isRoad(nx, ny) });
      }
    }
    return res;
  }

  /** Movimento: às vezes ruma ao twin mais próximo (socialização), senão vagueia.
   *  Só anda por calçadas/praças; cruza ruas apenas quando necessário. */
  private move(agent: GenerativeAgent, agents: GenerativeAgent[]): void {
    const pos = agent.getPosition();
    const steps = this.steps(pos);
    if (steps.length === 0) return; // sem saída (raro): fica parado

    // Socialização: caminhar reduzindo a distância até o vizinho mais próximo.
    if (Math.random() < 0.55 && agents.length > 1) {
      const other = this.nearestOther(agent, agents);
      if (other) {
        const np = other.getPosition();
        if (this.distance(pos, np) <= INTERACTION_RADIUS) return; // já perto: conversa
        const current = this.distance(pos, np);
        const better = steps
          .filter((s) => this.distance(s.to, np) < current)
          .sort((a, b) => Number(a.road) - Number(b.road)); // prefere calçada
        if (better.length > 0) {
          agent.setPosition(better[0].to, better[0].facing);
          return;
        }
      }
    }

    // Passeio com viés para calçada (evita o meio da rua).
    const pick = this.weightedStep(steps);
    if (pick) agent.setPosition(pick.to, pick.facing);
  }

  private weightedStep(
    steps: { to: Position; facing: Facing; road: boolean }[],
  ): { to: Position; facing: Facing } | null {
    const weights = steps.map((s) => (s.road ? 0.18 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < steps.length; i++) {
      r -= weights[i];
      if (r <= 0) return steps[i];
    }
    return steps[steps.length - 1] ?? null;
  }

  private nearestOther(agent: GenerativeAgent, agents: GenerativeAgent[]): GenerativeAgent | null {
    let best: GenerativeAgent | null = null;
    let bd = Infinity;
    for (const o of agents) {
      if (o.id === agent.id) continue;
      const d = this.distance(agent.getPosition(), o.getPosition());
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private distance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
}
