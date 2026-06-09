/**
 * Retrieval.ts (navegador)
 * ------------------------
 * Recuperação da Seção 4.1: score = α·recência + β·importância + γ·relevância,
 * com cada componente normalizado (min-max) antes da combinação linear.
 */
import type { MemoryRecord } from '../types';
import { cosineSimilarity, embed } from './embeddings';

export interface RetrievalWeights {
  recency: number;
  importance: number;
  relevance: number;
}

const DEFAULT_WEIGHTS: RetrievalWeights = { recency: 1, importance: 1, relevance: 1 };
const RECENCY_DECAY_PER_HOUR = 0.995;
const HOUR_MS = 60 * 60 * 1000;

export interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
}

export async function retrieve(
  memories: MemoryRecord[],
  query: string,
  now: number,
  topK = 8,
  weights: RetrievalWeights = DEFAULT_WEIGHTS,
): Promise<ScoredMemory[]> {
  if (memories.length === 0) return [];

  const queryEmbedding = await embed(query);

  const components = memories.map((m) => {
    const hoursSinceAccess = (now - m.lastAccessedAt) / HOUR_MS;
    const recency = Math.pow(RECENCY_DECAY_PER_HOUR, Math.max(0, hoursSinceAccess));
    const importance = m.importance / 10;
    const relevance = (cosineSimilarity(queryEmbedding, m.embedding) + 1) / 2;
    return { memory: m, recency, importance, relevance };
  });

  const norm = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return (v: number) => (v - min) / span;
  };
  const nRec = norm(components.map((c) => c.recency));
  const nImp = norm(components.map((c) => c.importance));
  const nRel = norm(components.map((c) => c.relevance));

  const scored: ScoredMemory[] = components.map((c) => ({
    memory: c.memory,
    score:
      weights.recency * nRec(c.recency) +
      weights.importance * nImp(c.importance) +
      weights.relevance * nRel(c.relevance),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
