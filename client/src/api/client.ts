/**
 * client.ts
 * ---------
 * Cliente da API: REST (fetch) para mutações + Socket.IO para o stream do mundo.
 */
import { io, type Socket } from 'socket.io-client';
import type { PersonaInjection, WorldContext, WorldSnapshot } from '../types';

let socket: Socket | null = null;

/** Conecta ao stream em tempo real do mundo. */
export function connectWorld(onUpdate: (snap: WorldSnapshot) => void): () => void {
  socket = io({ path: '/socket.io' });
  socket.on('world:update', onUpdate);
  return () => {
    socket?.off('world:update', onUpdate);
    socket?.disconnect();
    socket = null;
  };
}

export async function fetchHealth(): Promise<{ status: string; llm: string }> {
  const res = await fetch('/api/health');
  return res.json();
}

/** Atualiza o contexto global da cidade (formulário do "Deus"). */
export async function updateWorldContext(ctx: Partial<WorldContext>): Promise<void> {
  const res = await fetch('/api/world/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });
  if (!res.ok) throw new Error('Falha ao atualizar o contexto da cidade.');
}

/** Injeta uma nova persona na cidade em tempo real. */
export async function injectPersona(persona: PersonaInjection): Promise<void> {
  const res = await fetch('/api/personas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(persona),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ? 'Dados inválidos.' : 'Falha ao injetar persona.');
  }
}
