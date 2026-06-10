/**
 * types.ts — espelho dos tipos do backend usados pelo frontend.
 */
export interface PersonaCore {
  name: string;
  age: number;
  occupation: string;
  appearance: string;
  traits: string;
  spriteKey: string;
  /** Tom de pele (hex) para o personagem 3D — diversidade da população. */
  skin?: string;
}

export interface Position {
  x: number;
  y: number;
}

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface AgentRuntimeState {
  id: string;
  core: PersonaCore;
  position: Position;
  facing: Facing;
  currentAction: string;
  actionEmoji: string;
  speech: string | null;
  isMoving: boolean;
}

export interface WorldContext {
  description: string;
  weather: string;
  dayOfWeek: string;
  rules: string;
  recentEvents: string;
}

export interface WorldSnapshot {
  tick: number;
  context: WorldContext;
  agents: AgentRuntimeState[];
  width: number;
  height: number;
}

export interface PersonaInjection {
  core: PersonaCore;
  backstory: string[];
  relationships: string[];
  spawn?: Position;
}

/** Os três tipos de nó que vivem no Memory Stream. */
export type MemoryKind = 'observation' | 'reflection' | 'plan';

/** Um registro do Memory Stream (frase em linguagem natural + metadados). */
export interface MemoryRecord {
  id: string;
  agentId: string;
  kind: MemoryKind;
  description: string;
  createdAt: number;
  lastAccessedAt: number;
  importance: number;
  embedding: number[];
  evidence?: string[];
}
