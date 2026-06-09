/**
 * simulation.ts (navegador)
 * -------------------------
 * Singleton que hospeda o World no navegador e o Observador de Insights.
 * Substitui o backend: o loop de ticks e a análise rodam aqui, na aba.
 */
import { World } from './World';
import { observe } from './observer';
import { useInsights } from '../store/useInsights';
import type { PersonaInjection, WorldContext, WorldSnapshot } from '../types';

/** Intervalo entre ticks (ms). Maior que no server pois o LLM roda no cliente. */
const TICK_INTERVAL_MS = 9000;
/** Intervalo do observador que gera Insights automaticamente. */
const INSIGHT_INTERVAL_MS = 30000;

const world = new World(TICK_INTERVAL_MS);
world.start();

let observing = false;

/** Gera Insights a partir dos eventos acumulados (chamável também via UI). */
export async function requestInsight(): Promise<void> {
  if (observing) return;
  observing = true;
  useInsights.getState().setGenerating(true);
  try {
    const events = world.takeEvents();
    if (events.length === 0) return;
    const insights = await observe(events, world.getContext());
    if (insights.length) useInsights.getState().add(insights);
  } catch (err) {
    console.error('[Observer] falha ao gerar insight:', err);
  } finally {
    observing = false;
    useInsights.getState().setGenerating(false);
  }
}

// Observador automático.
setInterval(() => void requestInsight(), INSIGHT_INTERVAL_MS);

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
