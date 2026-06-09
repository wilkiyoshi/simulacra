/**
 * embeddings.ts
 * -------------
 * O cálculo de Relevância no Retrieval depende de comparar o embedding da
 * situação atual com o embedding de cada memória. A Anthropic não expõe um
 * endpoint de embeddings próprio, então abstraímos o provedor atrás de uma
 * interface.
 *
 * Por padrão usamos um embedding LOCAL determinístico (bag-of-words com hashing),
 * que roda sem dependências externas nem latência de rede — suficiente para a
 * similaridade semântica aproximada da simulação. Para produção, basta trocar
 * por um provedor real (ex.: Voyage AI, recomendado pela Anthropic) implementando
 * a mesma interface `EmbeddingProvider`.
 */

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

const DIM = 256;

/**
 * Provedor local: projeta tokens em um vetor de dimensão fixa via hashing.
 * Determinístico e dependency-free. Não captura semântica profunda, mas
 * agrupa textos que compartilham vocabulário — o bastante para o ranking.
 */
export class LocalHashingEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(DIM).fill(0);
    const tokens = tokenize(text);
    for (const token of tokens) {
      const idx = Math.abs(hash(token)) % DIM;
      vec[idx] += 1;
    }
    return normalize(vec);
  }
}

/** Similaridade de cosseno entre dois vetores (assumidos não-nulos). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // ambos já normalizados -> produto interno == cosseno
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

function normalize(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

/** Instância padrão compartilhada. */
export const embeddings: EmbeddingProvider = new LocalHashingEmbeddingProvider();
