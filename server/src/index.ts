/**
 * index.ts
 * --------
 * Ponto de entrada do backend. Sobe um servidor Fastify (REST) + Socket.IO
 * (tempo real) e expõe:
 *
 *   REST:
 *     GET  /api/health           — checagem de saúde + modo do LLM
 *     GET  /api/world            — snapshot atual do mundo
 *     POST /api/world/context    — atualiza o contexto global (formulário "Deus")
 *     POST /api/personas         — injeta uma nova persona em tempo real
 *
 *   WebSocket (Socket.IO):
 *     evento "world:update"      — snapshot do mundo a cada tick
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { config, hasLLM } from './config.js';
import { World } from './world/World.js';

const world = new World(config.tickIntervalMs);

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: config.clientOrigin });

// --- Validação de payloads (zod) -------------------------------------------

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });

const personaSchema = z.object({
  core: z.object({
    name: z.string().min(1),
    age: z.number().int().min(0).max(130),
    occupation: z.string().min(1),
    appearance: z.string().default(''),
    traits: z.string().min(1),
    spriteKey: z.string().default('villager'),
  }),
  backstory: z.array(z.string()).default([]),
  relationships: z.array(z.string()).default([]),
  spawn: positionSchema.optional(),
});

const contextSchema = z.object({
  description: z.string().optional(),
  weather: z.string().optional(),
  dayOfWeek: z.string().optional(),
  rules: z.string().optional(),
  recentEvents: z.string().optional(),
});

// --- Rotas REST ------------------------------------------------------------

fastify.get('/api/health', async () => ({
  status: 'ok',
  llm: hasLLM ? 'conectado' : 'modo simulado (defina ANTHROPIC_API_KEY)',
  tickIntervalMs: config.tickIntervalMs,
}));

fastify.get('/api/world', async () => world.snapshot());

fastify.post('/api/world/context', async (request, reply) => {
  const parsed = contextSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }
  world.setContext(parsed.data);
  return { ok: true, context: world.getContext() };
});

fastify.post('/api/personas', async (request, reply) => {
  const parsed = personaSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }
  const state = await world.addPersona(parsed.data);
  return { ok: true, agent: state };
});

// --- Inicialização ---------------------------------------------------------

const address = await fastify.listen({ port: config.port, host: '0.0.0.0' });

// Socket.IO compartilhando o servidor HTTP do Fastify.
const io = new SocketServer(fastify.server, {
  cors: { origin: config.clientOrigin },
});

io.on('connection', (socket) => {
  // Envia o estado atual e inscreve para atualizações por tick.
  const unsubscribe = world.subscribe((snapshot) => {
    socket.emit('world:update', snapshot);
  });
  socket.on('disconnect', unsubscribe);
});

world.start();

fastify.log.info(`Simulacra rodando em ${address} (LLM: ${hasLLM ? 'on' : 'simulado'})`);
