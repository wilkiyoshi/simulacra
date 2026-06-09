/**
 * simulation.ts (navegador)
 * -------------------------
 * Singleton que hospeda a instância do World no navegador e expõe a API que a
 * UI consome. Substitui o backend: o loop de ticks roda aqui, na aba.
 */
import { World } from './World';
import type { PersonaInjection, WorldContext, WorldSnapshot } from '../types';

/** Intervalo entre ticks (ms). Maior que no server pois o LLM roda no cliente. */
const TICK_INTERVAL_MS = 9000;

const world = new World(TICK_INTERVAL_MS);
world.start();

export const simulation = {
  subscribe(listener: (snap: WorldSnapshot) => void): () => void {
    return world.subscribe(listener);
  },
  addPersona(injection: PersonaInjection) {
    return world.addPersona(injection);
  },
  setContext(ctx: Partial<WorldContext>): void {
    world.setContext(ctx);
  },
  getContext(): WorldContext {
    return world.getContext();
  },
};
