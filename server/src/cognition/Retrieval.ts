/**
 * Retrieval.ts
 * ------------
 * Implementa a função de Recuperação da Seção 4.1 do artigo. Dado o contexto
 * atual (uma "query"), retorna as memórias mais salientes combinando:
 *
 *   - Recência (recency):    decaimento exponencial desde o último acesso.
 *   - Importância (importance): a poignancy [1..10] atribuída pelo LLM.
 *   - Relevância (relevance):  similaridade de cosseno entre embeddings.
 *
 * Cada componente é normalizado para [0,1] (min-max) e combinado linearmente.
 */
import type { MemoryRecord } from './types.js';
import { cosineSimilarity, embeddings } from '../llm/embeddings.js';

/** Pesos α, β, γ. No artigo todos valem 1; expomos para tuning. */
export interface RetrievalWeights {
  recency: number;
  importance: number;
  relevance: number;
}

const DEFAULT_WEIGHTS: RetrievalWeights = {
  recency: 1,
  importance: 1,
  relevance: 1,
};

/** Fator de decaimento da recência por hora de simulação (0.995 no artigo). */
const RECENCY_DECAY_PER_HOUR = 0.995;
const HOUR_MS = 60 * 60 * 1000;

export interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
}

/**
 * Recupera as `topK` memórias mais relevantes para `query`, no instante `now`.
 */
export async function retrieve(
  memories: MemoryRecord[],
  query: string,
  now: number,
  topK = 8,
  weights: RetrievalWeights = DEFAULT_WEIGHTS,
): Promise<ScoredMemory[]> {
  if (memories.length === 0) return [];

  const queryEmbedding = await embeddings.embed(query);

  // 1. Componentes brutos por memória.
  const components = memories.map((m) => {
    const hoursSinceAccess = (now - m.lastAccessedAt) / HOUR_MS;
    const recency = Math.pow(RECENCY_DECAY_PER_HOUR, Math.max(0, hoursSinceAccess));
    const importance = m.importance / 10; // já em [0,1]
    const relevance = (cosineSimilarity(queryEmbedding, m.embedding) + 1) / 2; // [0,1]
    return { memory: m, recency, importance, relevance };
  });

  // 2. Normalização min-max de cada componente (robustez do ranking).
  const norm = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return (v: number) => (v - min) / span;
  };
  const nRec = norm(components.map((c) => c.recency));
  const nImp = norm(components.map((c) => c.importance));
  const nRel = norm(components.map((c) => c.relevance));

  // 3. Combinação linear ponderada.
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
