/**
 * anthropic.ts
 * ------------
 * Fina camada de abstração sobre o SDK oficial da Anthropic. Concentra toda a
 * comunicação com o LLM para que os módulos cognitivos não conheçam detalhes
 * de transporte. Se não houver chave de API, cai em respostas determinísticas
 * de "modo simulado", permitindo desenvolver o frontend offline.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config, hasLLM } from '../config.js';

const client = hasLLM ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

/**
 * Pensamento adaptativo (recomendado para Opus 4.x). É declarado como `any`
 * porque versões do SDK anteriores a esses modelos ainda não tipam o valor
 * "adaptive" — a API o aceita em tempo de execução.
 */
const ADAPTIVE_THINKING = { type: 'adaptive' } as unknown as Anthropic.ThinkingConfigParam;

export interface CompleteOptions {
  /** Prompt de sistema (persona/instruções). */
  system: string;
  /** Mensagem do usuário (a tarefa concreta). */
  prompt: string;
  /** Usar o modelo de raciocínio profundo (reflexão/planejamento)? */
  deep?: boolean;
  /** Teto de tokens de saída. */
  maxTokens?: number;
}

/**
 * Completa um prompt e retorna texto puro.
 *
 * Decisões de modelo seguem a recomendação da skill claude-api:
 *  - `deep: true`  -> Opus 4.8 com thinking adaptativo (planejamento/reflexão).
 *  - `deep: false` -> Haiku 4.5 (ações por tick, baratas e frequentes).
 */
export async function complete(opts: CompleteOptions): Promise<string> {
  const { system, prompt, deep = false, maxTokens = 1024 } = opts;

  if (!client) {
    return simulatedResponse(prompt);
  }

  const model = deep ? config.modelReasoning : config.modelFast;

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    // Pensamento adaptativo só faz sentido (e é suportado) nos modelos Opus 4.x.
    ...(deep ? { thinking: ADAPTIVE_THINKING } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return text;
}

/**
 * Completa um prompt e força saída JSON estruturada validável.
 * Usa `output_config.format` (substituto recomendado para prefill nos modelos 4.x).
 */
export async function completeJSON<T>(
  opts: CompleteOptions & { schema: Record<string, unknown> },
): Promise<T> {
  const { system, prompt, deep = false, maxTokens = 1024, schema } = opts;

  if (!client) {
    return simulatedJSON<T>(prompt, schema);
  }

  const model = deep ? config.modelReasoning : config.modelFast;

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    ...(deep ? { thinking: ADAPTIVE_THINKING } : {}),
    // @ts-expect-error output_config é a API canônica de structured outputs.
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
//  Modo simulado (sem chave de API) — mantém a simulação "viva" para demos.
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
  const seed = Math.abs(hashCode(prompt));
  return FALLBACK_ACTIONS[seed % FALLBACK_ACTIONS.length];
}

function simulatedJSON<T>(prompt: string, _schema: Record<string, unknown>): T {
  const seed = Math.abs(hashCode(prompt));
  // Heurística simples para devolver algo coerente em modo offline.
  return {
    action: FALLBACK_ACTIONS[seed % FALLBACK_ACTIONS.length],
    emoji: '🚶',
    importance: (seed % 9) + 1,
  } as unknown as T;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
