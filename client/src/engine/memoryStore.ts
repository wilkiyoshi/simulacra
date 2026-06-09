/**
 * memoryStore.ts (navegador)
 * --------------------------
 * Substitui o SQLite do backend por um armazenamento em memória. Mantém a
 * mesma API que o MemoryStream espera, então a lógica cognitiva é idêntica à
 * do servidor. (O estado vive enquanto a aba estiver aberta; só a chave de API
 * é persistida no localStorage.)
 */
import type { MemoryRecord } from '../types';

const memories: MemoryRecord[] = [];

export function insertMemoryRow(m: MemoryRecord): void {
  memories.push(m);
}

export function selectMemoriesByAgent(agentId: string): MemoryRecord[] {
  return memories.filter((m) => m.agentId === agentId);
}

export function touchMemory(id: string, when: number): void {
  const m = memories.find((x) => x.id === id);
  if (m) m.lastAccessedAt = when;
}
