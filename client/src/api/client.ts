/**
 * client.ts
 * ---------
 * Antes falava com um backend via REST + Socket.IO. Agora a simulação roda
 * inteira no navegador, então estas funções apenas delegam ao singleton
 * `simulation`. As assinaturas foram mantidas para não mexer nos componentes.
 */
import { simulation } from '../engine/simulation';
import { hasLLM } from '../store/useSettings';
import type { PersonaInjection, WorldContext, WorldSnapshot } from '../types';

/** Inscreve para receber snapshots do mundo a cada tick. */
export function connectWorld(onUpdate: (snap: WorldSnapshot) => void): () => void {
  return simulation.subscribe(onUpdate);
}

export async function fetchHealth(): Promise<{ status: string; llm: string }> {
  return {
    status: 'ok',
    llm: hasLLM() ? 'conectado (navegador)' : 'modo simulado (configure sua chave)',
  };
}

/** Atualiza o contexto global da cidade (formulário do "Deus"). */
export async function updateWorldContext(ctx: Partial<WorldContext>): Promise<void> {
  simulation.setContext(ctx);
}

/** Injeta uma nova persona na cidade. */
export async function injectPersona(persona: PersonaInjection): Promise<void> {
  await simulation.addPersona(persona);
}
