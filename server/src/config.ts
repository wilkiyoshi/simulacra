/**
 * config.ts
 * ---------
 * Centraliza a leitura das variáveis de ambiente. Mantém o resto do código
 * livre de `process.env` espalhado e garante valores padrão sensatos.
 */
import 'dotenv/config';

export const config = {
  /** Chave da API Anthropic. Sem ela, a cognição roda em "modo simulado". */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',

  /** Modelo para tarefas profundas: reflexão e planejamento diário. */
  modelReasoning: process.env.MODEL_REASONING ?? 'claude-opus-4-8',

  /** Modelo rápido/barato: ações por tick, importância e diálogos curtos. */
  modelFast: process.env.MODEL_FAST ?? 'claude-haiku-4-5',

  /** Porta HTTP/WebSocket do backend. */
  port: Number(process.env.PORT ?? 3001),

  /** Origem do frontend permitida via CORS e Socket.IO. */
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  /** Arquivo do banco SQLite onde o Memory Stream é persistido. */
  databasePath: process.env.DATABASE_PATH ?? './data/simulacra.sqlite',

  /** Intervalo entre ticks da simulação (ms). */
  tickIntervalMs: Number(process.env.TICK_INTERVAL_MS ?? 8000),
} as const;

/** Indica se temos uma chave real para chamar o LLM. */
export const hasLLM = config.anthropicApiKey.length > 0;
