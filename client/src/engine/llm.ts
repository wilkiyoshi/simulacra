/**
 * llm.ts (navegador)
 * ------------------
 * Camada de comunicação com a Anthropic rodando 100% no navegador. A chave é
 * lida do `useSettings` (localStorage) a cada chamada, então trocar/apagar a
 * chave passa a valer imediatamente. Sem chave, cai em "modo simulado".
 *
 * Atenção: usa `dangerouslyAllowBrowser` — aceitável aqui porque cada usuário
 * fornece a PRÓPRIA chave, que fica apenas no seu navegador.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, getModels } from '../store/useSettings';

// Reaproveita o cliente enquanto a chave não muda.
let cached: { key: string; client: Anthropic } | null = null;

function getClient(): Anthropic | null {
  const key = getApiKey().trim();
  if (!key) return null;
  if (cached && cached.key === key) return cached.client;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  cached = { key, client };
  return client;
}

/**
 * Pensamento adaptativo (recomendado para Opus 4.x). Declarado como cast
 * porque versões do SDK anteriores a esses modelos não tipam "adaptive".
 */
const ADAPTIVE_THINKING = { type: 'adaptive' } as unknown as Anthropic.ThinkingConfigParam;

export interface CompleteOptions {
  system: string;
  prompt: string;
  /** true -> modelo de raciocínio (Opus); false -> rápido (Haiku). */
  deep?: boolean;
  maxTokens?: number;
}

/** Completa um prompt e retorna texto puro. */
export async function complete(opts: CompleteOptions): Promise<string> {
  const { system, prompt, deep = false, maxTokens = 1024 } = opts;
  const client = getClient();
  if (!client) return simulatedResponse(prompt);

  const { reasoning, fast } = getModels();
  const model = deep ? reasoning : fast;

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    ...(deep ? { thinking: ADAPTIVE_THINKING } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Completa e devolve JSON estruturado. Em vez de depender de `output_config`
 * (que varia entre versões do SDK), instruímos o modelo a responder apenas
 * com JSON no formato do schema e extraímos o primeiro objeto válido.
 */
export async function completeJSON<T>(
  opts: CompleteOptions & { schema: Record<string, unknown> },
): Promise<T> {
  const { system, prompt, deep = false, maxTokens = 1024, schema } = opts;
  const client = getClient();
  if (!client) return simulatedJSON<T>(prompt);

  const { reasoning, fast } = getModels();
  const model = deep ? reasoning : fast;

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system:
      system +
      '\n\nResponda EXCLUSIVAMENTE com um objeto JSON válido neste schema ' +
      `(sem markdown, sem texto extra):\n${JSON.stringify(schema)}`,
    ...(deep ? { thinking: ADAPTIVE_THINKING } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return parseJsonLoose<T>(text);
}

/** Extrai o primeiro objeto JSON de um texto (tolerante a cercas/ruído). */
function parseJsonLoose<T>(text: string): T {
  const fenced = text.replace(/```json|```/gi, '');
  const match = fenced.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : fenced) as T;
}

// ---------------------------------------------------------------------------
//  Modo simulado (sem chave) — mantém a cidade viva para demonstração.
// ---------------------------------------------------------------------------

const FALLBACK_ACTIONS = [
  'caminhando pela praça',
  'tomando um café',
  'lendo o jornal',
  'conversando com vizinhos',
  'regando as plantas',
  'observando o movimento da cidade',
];

function simulatedResponse(prompt: string): string {
  return FALLBACK_ACTIONS[Math.abs(hashCode(prompt)) % FALLBACK_ACTIONS.length];
}

function simulatedJSON<T>(prompt: string): T {
  const seed = Math.abs(hashCode(prompt));
  return {
    action: FALLBACK_ACTIONS[seed % FALLBACK_ACTIONS.length],
    emoji: '🚶',
    speech: null,
    importance: (seed % 9) + 1,
    insights: [],
  } as unknown as T;
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
