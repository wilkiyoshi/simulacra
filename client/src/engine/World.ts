/**
 * World.ts (navegador)
 * --------------------
 * Sandbox da simulação no navegador. Os digital twins navegam pelas calçadas
 * com A* até pontos de interesse (lojas/casas), entram nos imóveis e ficam um
 * tempo dentro, conversam em diálogos de várias falas, e respeitam colisões
 * (nunca atravessam prédios). Um twin pode ser "controlado" (1ª pessoa), caso
 * em que o motor não o move automaticamente.
 */
import { nanoid } from 'nanoid';
import { GenerativeAgent } from './GenerativeAgent';
import { cityMap, type Tile, type BuildingStruct } from '../city/map';
import { findPath } from './pathfind';
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
const INTERACTION_RADIUS = 2;

export type WorldListener = (snapshot: WorldSnapshot) => void;

export interface WorldEvent {
  tick: number;
  kind: 'action' | 'talk';
  text: string;
}

interface NavState {
  goal: Tile | null;
  path: Tile[];
  enter: BuildingStruct | null;
  inside: number;
  dwell: number;
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
  private readonly nav = new Map<string, NavState>();
  private readonly controlled = new Set<string>();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepping = false;

  private simClock = Date.now();
  private readonly SIM_MINUTES_PER_TICK = 30;
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
    this.nav.set(id, { goal: null, path: [], enter: null, inside: 0, dwell: 0 });
    for (const other of this.agents.values()) {
      if (other.id !== id) {
        await other.perceive(`${injection.core.name} (${injection.core.occupation}) chegou à cidade.`, this.simClock, 4);
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
    return { tick: this.tick, context: this.context, agents: this.listAgents(), width: GRID_WIDTH, height: GRID_HEIGHT };
  }

  takeEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // --- Controle em 1ª pessoa -------------------------------------------------

  setControlled(id: string, on: boolean): void {
    if (on) this.controlled.add(id);
    else this.controlled.delete(id);
    const st = this.nav.get(id);
    if (st) {
      st.path = [];
      st.goal = null;
      st.enter = null;
      st.inside = 0;
      st.dwell = 0;
    }
  }

  placeAgentTile(id: string, tile: Tile): void {
    const agent = this.agents.get(id);
    if (agent) agent.setPosition({ x: tile.x, y: tile.y }, 'down');
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
        if (this.controlled.has(agent.id)) continue;
        const perception = this.describeSurroundings(agent);
        await agent.tick(this.context, perception, this.simClock);
        this.navigate(agent, agents);
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

  // --- Conversas (diálogo de várias falas) -----------------------------------

  private async resolveInteractions(agents: GenerativeAgent[]): Promise<void> {
    const active = agents.filter((a) => !this.controlled.has(a.id));
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (a.toRuntimeState().speech || b.toRuntimeState().speech) continue;
        if (this.distance(a.getPosition(), b.getPosition()) <= INTERACTION_RADIUS) {
          await this.playDialogue(a, b);
          return;
        }
      }
    }
  }

  private async playDialogue(a: GenerativeAgent, b: GenerativeAgent): Promise<void> {
    const lines = await a.dialogueWith(b, this.simClock);
    for (const l of lines) {
      a.setSpeech(null);
      b.setSpeech(null);
      const speaker = l.who === 'self' ? a : b;
      speaker.setSpeech(l.text);
      this.pushEvent('talk', `${speaker.core.name}: "${l.text}"`);
      this.broadcast();
      await this.delay(1700);
    }
    a.setSpeech(null);
    b.setSpeech(null);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- Navegação (A* + entrar em imóveis) ------------------------------------

  private navigate(agent: GenerativeAgent, agents: GenerativeAgent[]): void {
    const st = this.nav.get(agent.id);
    if (!st) return;
    const pos = agent.getPosition();

    if (st.inside > 0) {
      st.inside -= 1;
      if (st.inside === 0 && st.enter?.entrance) {
        agent.setPosition({ ...st.enter.entrance }, faceTo(pos, st.enter.entrance));
        st.enter = null;
        st.dwell = 1;
      }
      return;
    }
    if (st.dwell > 0) {
      st.dwell -= 1;
      return;
    }
    if (!st.goal || st.path.length === 0) {
      this.assignGoal(agent, st, agents);
    }
    if (st.path.length === 0) {
      this.wanderStep(agent);
      return;
    }

    const next = st.path[0];
    const isGoalEnter = st.enter !== null && next.x === st.goal?.x && next.y === st.goal?.y;
    if (!cityMap.isWalkable(next.x, next.y) && !isGoalEnter) {
      st.path = [];
      st.goal = null;
      return;
    }
    st.path.shift();
    agent.setPosition({ x: next.x, y: next.y }, faceTo(pos, next));

    if (st.path.length === 0) {
      if (st.enter) {
        const c = { x: st.enter.x, y: st.enter.y };
        agent.setPosition(c, faceTo(next, c));
        st.inside = 2 + Math.floor(Math.random() * 3);
      } else {
        st.dwell = 1 + Math.floor(Math.random() * 2);
      }
    }
  }

  private assignGoal(agent: GenerativeAgent, st: NavState, agents: GenerativeAgent[]): void {
    const pos = agent.getPosition();
    const r = Math.random();
    st.enter = null;
    st.goal = null;

    if (r < 0.5 && cityMap.pois.length > 0) {
      const poi = cityMap.pois[Math.floor(Math.random() * cityMap.pois.length)];
      if (poi.entrance) {
        st.enter = poi;
        st.goal = { ...poi.entrance };
      }
    } else if (r < 0.72 && agents.length > 1) {
      const other = this.nearestOther(agent, agents);
      if (other) st.goal = this.nearestWalkable(other.getPosition());
    }
    if (!st.goal) st.goal = cityMap.randomSpawn();

    const path = st.goal ? findPath(pos, st.goal, false) : null;
    st.path = path ?? [];
    if (!path) {
      st.goal = null;
      st.enter = null;
    }
  }

  private nearestWalkable(t: Tile): Tile {
    if (cityMap.isWalkable(t.x, t.y)) return { ...t };
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = t.x + dx;
          const ny = t.y + dy;
          if (cityMap.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return cityMap.randomSpawn();
  }

  private wanderStep(agent: GenerativeAgent): void {
    const pos = agent.getPosition();
    const opts: { d: Position; f: Facing }[] = [
      { d: { x: 0, y: -1 }, f: 'up' },
      { d: { x: 0, y: 1 }, f: 'down' },
      { d: { x: -1, y: 0 }, f: 'left' },
      { d: { x: 1, y: 0 }, f: 'right' },
    ];
    const walkable = opts.filter((o) => cityMap.isWalkable(pos.x + o.d.x, pos.y + o.d.y));
    if (walkable.length === 0) return;
    const weights = walkable.map((o) => (cityMap.isRoad(pos.x + o.d.x, pos.y + o.d.y) ? 0.18 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let rr = Math.random() * total;
    let pick = walkable[0];
    for (let i = 0; i < walkable.length; i++) {
      rr -= weights[i];
      if (rr <= 0) {
        pick = walkable[i];
        break;
      }
    }
    agent.setPosition({ x: pos.x + pick.d.x, y: pos.y + pick.d.y }, pick.f);
  }

  private describeSurroundings(agent: GenerativeAgent): string {
    const pos = agent.getPosition();
    const here = cityMap.structAt(pos.x, pos.y);
    const nearby = [...this.agents.values()]
      .filter((o) => o.id !== agent.id && this.distance(pos, o.getPosition()) <= 3)
      .map((o) => o.core.name);
    const place = here ? `Você está dentro de um local (${here.kind === 'shop' ? 'comércio' : 'casa'}).` : '';
    const base = `Você está na cidade durante ${this.context.dayOfWeek}, clima ${this.context.weather}. ${place}`;
    return nearby.length > 0 ? `${base} Por perto: ${nearby.join(', ')}.` : `${base} Não há ninguém por perto.`;
  }

  private nearestOther(agent: GenerativeAgent, agents: GenerativeAgent[]): GenerativeAgent | null {
    let best: GenerativeAgent | null = null;
    let bd = Infinity;
    for (const o of agents) {
      if (o.id === agent.id || this.controlled.has(o.id)) continue;
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

function faceTo(from: Tile, to: Tile): Facing {
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  if (to.y > from.y) return 'down';
  return 'up';
}
