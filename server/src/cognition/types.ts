/**
 * types.ts
 * --------
 * Tipos centrais da arquitetura cognitiva, espelhando os conceitos do artigo
 * "Generative Agents: Interactive Simulacra of Human Behavior" (Stanford, 2304.03442).
 */

/** Os três tipos de nó que vivem no Memory Stream. */
export type MemoryKind =
  | 'observation' // percepção bruta do mundo ("João está regando as plantas")
  | 'reflection' // crença/insight de alto nível sintetizado a partir de memórias
  | 'plan'; // intenção/ação planejada ("vou abrir a cafeteria às 8h")

/**
 * Um único registro no Memory Stream. Cada memória é uma frase em linguagem
 * natural com metadados que alimentam o algoritmo de Recuperação (Retrieval).
 */
export interface MemoryRecord {
  id: string;
  agentId: string;
  kind: MemoryKind;
  /** Descrição em linguagem natural do evento/pensamento. */
  description: string;
  /** Quando a memória foi criada (epoch ms — relógio da simulação). */
  createdAt: number;
  /** Último acesso, usado para o cálculo de Recência. */
  lastAccessedAt: number;
  /** Pontuação de Importância [1..10] atribuída pelo LLM (poignancy). */
  importance: number;
  /** Embedding para o cálculo de Relevância via similaridade de cosseno. */
  embedding: number[];
  /** IDs das memórias que deram origem a esta (apenas para reflexões). */
  evidence?: string[];
}

/** Traços de personalidade e identidade de uma persona. */
export interface PersonaCore {
  name: string;
  age: number;
  occupation: string;
  /** Descrição física — usada para casar com o sprite no frontend. */
  appearance: string;
  /** Traços psicológicos, forma de pensar e agir (innate traits). */
  traits: string;
  /** Chave do sprite sheet a ser usado no jogo (ex.: "villager_f"). */
  spriteKey: string;
}

/** Posição em coordenadas de tile dentro do mapa da cidade. */
export interface Position {
  x: number;
  y: number;
}

/** Direção que o sprite está encarando (para animações). */
export type Facing = 'up' | 'down' | 'left' | 'right';

/**
 * Estado de execução visível de um agente — o que o frontend precisa para
 * renderizar o sprite, suas animações e balões de fala.
 */
export interface AgentRuntimeState {
  id: string;
  core: PersonaCore;
  position: Position;
  facing: Facing;
  /** Ação corrente em linguagem natural ("preparando café"). */
  currentAction: string;
  /** Emoji/ícone curto que resume a ação para o HUD. */
  actionEmoji: string;
  /** Texto do balão de fala ativo (ou null se em silêncio). */
  speech: string | null;
  /** true enquanto o agente está em movimento (anima "walk"). */
  isMoving: boolean;
}

/** Contexto global do mundo definido pelo usuário ("Deus" da simulação). */
export interface WorldContext {
  /** O que é a cidade. */
  description: string;
  /** Clima atual ("ensolarado", "chuvoso"...). */
  weather: string;
  /** Dia da semana. */
  dayOfWeek: string;
  /** Regras globais que todos os agentes conhecem. */
  rules: string;
  /** Eventos recentes que afetam a todos ("Hoje é o festival da cidade"). */
  recentEvents: string;
}

/** Payload do formulário de injeção de nova persona (frontend -> backend). */
export interface PersonaInjection {
  core: PersonaCore;
  /** Histórico passado — sementes iniciais do Memory Stream. */
  backstory: string[];
  /** Relacionamentos preexistentes ("é casado com Maria"). */
  relationships: string[];
  /** Posição inicial opcional; se ausente, é sorteada. */
  spawn?: Position;
}
