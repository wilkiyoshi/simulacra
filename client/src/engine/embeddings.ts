/**
 * embeddings.ts (navegador)
 * -------------------------
 * Embedding local determinístico (bag-of-words com hashing) para o cálculo de
 * Relevância no Retrieval — roda no navegador, sem rede nem dependências.
 * Para semântica mais forte, troque por um provedor real (ex.: Voyage AI)
 * implementando a mesma interface.
 */
const DIM = 256;

export async function embed(text: string): Promise<number[]> {
  const vec = new Array<number>(DIM).fill(0);
  for (const token of tokenize(text)) {
    vec[Math.abs(hash(token)) % DIM] += 1;
  }
  return normalize(vec);
}

/** Similaridade de cosseno entre vetores já normalizados. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
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
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}
