/**
 * observer.ts (navegador)
 * -----------------------
 * O "Observador" da cidade: lê os eventos recentes (ações e conversas dos
 * digital twins) e sintetiza Insights de alto nível sobre o que está
 * acontecendo e o comportamento dos habitantes. Sem chave de API, gera um
 * resumo heurístico simples.
 */
import { complete } from './llm';
import { hasLLM } from '../store/useSettings';
import type { WorldContext } from '../types';
import type { WorldEvent } from './World';

export async function observe(events: WorldEvent[], context: WorldContext): Promise<string[]> {
  if (events.length === 0) return [];

  if (!hasLLM()) {
    return [heuristicInsight(events)];
  }

  const log = events.map((e) => `- ${e.text}`).join('\n');
  const raw = await complete({
    system:
      'Você é um analista observando uma mini cidade habitada por "digital twins" ' +
      '(personas sintéticas autônomas). A partir dos eventos recentes, gere de 1 a 3 ' +
      'INSIGHTS curtos e perspicazes sobre o que está acontecendo, padrões de ' +
      'comportamento, relações e dinâmicas sociais emergentes. Seja específico e cite ' +
      'nomes quando relevante. Um insight por linha, sem numeração.',
    prompt:
      `Cidade: ${context.description}\n` +
      `Clima: ${context.weather} · Dia: ${context.dayOfWeek}\n` +
      `Eventos globais: ${context.recentEvents}\n\n` +
      `Eventos recentes na cidade:\n${log}`,
    deep: true,
    maxTokens: 400,
  });

  return raw
    .split('\n')
    .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 3);
}

function heuristicInsight(events: WorldEvent[]): string {
  const talks = events.filter((e) => e.kind === 'talk').length;
  const actions = events.filter((e) => e.kind === 'action').length;
  if (talks > 0) {
    return `A cidade está sociável: ${talks} fala(s) trocada(s) e ${actions} ação(ões) observadas. ` +
      `(Configure sua chave da Anthropic em ⚙️ para insights gerados por IA.)`;
  }
  return `Movimento tranquilo: ${actions} ação(ões) registradas, sem conversas ainda. ` +
    `(Configure sua chave da Anthropic em ⚙️ para insights gerados por IA.)`;
}
