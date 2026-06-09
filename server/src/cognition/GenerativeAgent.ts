/**
 * GenerativeAgent.ts  ★ MÓDULO CENTRAL ★
 * --------------------------------------
 * A classe que costura todos os módulos cognitivos numa única persona viva.
 * Cada agente possui seu próprio Memory Stream e os módulos de Retrieval,
 * Reflection e Planning operando sobre ele — exatamente a arquitetura da
 * Figura 2 do artigo de Stanford.
 *
 * Ciclo de vida:
 *   1. `seed()`      — injeta backstory/relacionamentos no Memory Stream.
 *   2. `planDay()`   — gera o roteiro de alto nível do dia.
 *   3. `tick()`      — a cada passo da simulação, decide a próxima ação,
 *                      observa o resultado e dispara reflexão se necessário.
 *   4. `perceive()`  — registra observações do ambiente como memórias.
 *   5. `converse()`  — reage a outro agente próximo gerando uma fala.
 */
import type {
  AgentRuntimeState,
  Facing,
  PersonaCore,
  PersonaInjection,
  Position,
  WorldContext,
} from './types.js';
import { MemoryStream } from './MemoryStream.js';
import { Reflection, REFLECTION_THRESHOLD } from './Reflection.js';
import { Planning, type TickDecision } from './Planning.js';

export class GenerativeAgent {
  readonly id: string;
  readonly core: PersonaCore;

  // --- Módulos cognitivos (um por agente) ----------------------------------
  private readonly memory: MemoryStream;
  private readonly reflection: Reflection;
  private readonly planning: Planning;

  // --- Estado de execução (visível ao frontend) ----------------------------
  private position: Position;
  private facing: Facing = 'down';
  private currentAction = 'ocioso';
  private actionEmoji = '🙂';
  private speech: string | null = null;
  private isMoving = false;

  // --- Estado de planejamento ----------------------------------------------
  private dailyPlan: string[] = [];
  private lastReflectionAt = 0;

  /** Relacionamentos preexistentes, indexados por nome do outro agente. */
  private readonly relationships = new Map<string, string>();

  constructor(id: string, core: PersonaCore, spawn: Position) {
    this.id = id;
    this.core = core;
    this.position = spawn;
    this.memory = new MemoryStream(id);
    this.reflection = new Reflection(core, this.memory);
    this.planning = new Planning(core, this.memory);
  }

  /**
   * Cria um agente a partir do payload de injeção do dashboard e semeia seu
   * Memory Stream com o histórico passado e os relacionamentos.
   */
  static async create(
    id: string,
    injection: PersonaInjection,
    fallbackSpawn: Position,
    now: number,
  ): Promise<GenerativeAgent> {
    const agent = new GenerativeAgent(id, injection.core, injection.spawn ?? fallbackSpawn);
    await agent.seed(injection, now);
    return agent;
  }

  /** Injeta backstory e relacionamentos como memórias-semente. */
  private async seed(injection: PersonaInjection, now: number): Promise<void> {
    // Backstory: memórias com importância alta (são definidoras da identidade).
    for (const fact of injection.backstory) {
      await this.memory.add('observation', fact, now, { importance: 7 });
    }
    for (const rel of injection.relationships) {
      await this.memory.add('observation', rel, now, { importance: 6 });
      // Heurística simples: extrai um nome próprio do relacionamento.
      const nameMatch = rel.match(/\b[A-ZÀ-Ý][a-zà-ÿ]+\b/);
      if (nameMatch) this.relationships.set(nameMatch[0], rel);
    }
    this.lastReflectionAt = now;
  }

  /** Gera o roteiro do dia com base no contexto global. */
  async planDay(world: WorldContext, now: number): Promise<void> {
    this.dailyPlan = await this.planning.dailyPlan(world, now);
    await this.memory.add(
      'plan',
      `Plano do dia: ${this.dailyPlan.join('; ')}`,
      now,
      { importance: 6 },
    );
  }

  /**
   * Um passo da simulação. Decide a próxima ação, registra-a como observação
   * e — se a importância acumulada cruzar o limiar — dispara uma reflexão.
   */
  async tick(world: WorldContext, perception: string, now: number): Promise<void> {
    if (this.dailyPlan.length === 0) {
      await this.planDay(world, now);
    }

    const decision: TickDecision = await this.planning.decideAction(
      world,
      this.dailyPlan,
      perception,
      now,
    );

    this.applyDecision(decision);

    // A própria ação vira uma observação no fluxo de memória.
    await this.memory.add('observation', `Eu estou ${decision.action}.`, now);

    // Reflexão disparada por acúmulo de importância (Seção 4.2).
    if (this.memory.importanceSince(this.lastReflectionAt) >= REFLECTION_THRESHOLD) {
      await this.reflection.reflect(now);
      this.lastReflectionAt = now;
    }
  }

  /** Registra uma percepção do ambiente como observação. */
  async perceive(observation: string, now: number): Promise<void> {
    await this.memory.add('observation', observation, now);
  }

  /**
   * Reage a outro agente próximo, possivelmente gerando uma fala. Retorna o
   * texto dito (para o frontend exibir o balão) ou null.
   */
  async converse(other: GenerativeAgent, now: number): Promise<string | null> {
    const hint =
      this.relationships.get(other.core.name) ??
      `Você não conhece bem ${other.core.name}.`;

    const line = await this.planning.react(other.core.name, hint, now);
    if (line) {
      this.speech = line;
      await this.memory.add(
        'observation',
        `Eu disse para ${other.core.name}: "${line}"`,
        now,
        { importance: 4 },
      );
      // O ouvinte também memoriza o que foi dito.
      await other.perceive(`${this.core.name} me disse: "${line}"`, now);
    }
    return line;
  }

  // --- Movimento / posição --------------------------------------------------

  setPosition(pos: Position, facing: Facing): void {
    this.facing = facing;
    this.isMoving = pos.x !== this.position.x || pos.y !== this.position.y;
    this.position = pos;
  }

  getPosition(): Position {
    return this.position;
  }

  /** Limpa o balão de fala (chamado pelo loop após exibi-lo por um tempo). */
  clearSpeech(): void {
    this.speech = null;
  }

  private applyDecision(decision: TickDecision): void {
    this.currentAction = decision.action;
    this.actionEmoji = decision.emoji || '🙂';
    this.speech = decision.speech;
  }

  /** Snapshot serializável enviado ao frontend a cada atualização. */
  toRuntimeState(): AgentRuntimeState {
    return {
      id: this.id,
      core: this.core,
      position: this.position,
      facing: this.facing,
      currentAction: this.currentAction,
      actionEmoji: this.actionEmoji,
      speech: this.speech,
      isMoving: this.isMoving,
    };
  }
}
