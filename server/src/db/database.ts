/**
 * database.ts
 * -----------
 * Camada de persistência (SQLite via better-sqlite3). O Memory Stream é
 * relacional com busca semântica feita em memória (embeddings serializados
 * como JSON). Para escala maior, a mesma tabela pode migrar para um banco
 * vetorial (pgvector, sqlite-vec) sem alterar a API do MemoryStream.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { MemoryRecord } from '../cognition/types.js';

// Garante que o diretório do arquivo .sqlite exista.
mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,
    description     TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL,
    importance      REAL NOT NULL,
    embedding       TEXT NOT NULL,
    evidence        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);

  CREATE TABLE IF NOT EXISTS agents (
    id      TEXT PRIMARY KEY,
    data    TEXT NOT NULL
  );
`);

// --- Mapeamento linha <-> objeto -------------------------------------------

interface MemoryRow {
  id: string;
  agent_id: string;
  kind: string;
  description: string;
  created_at: number;
  last_accessed_at: number;
  importance: number;
  embedding: string;
  evidence: string | null;
}

export function rowToMemory(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    kind: row.kind as MemoryRecord['kind'],
    description: row.description,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    importance: row.importance,
    embedding: JSON.parse(row.embedding),
    evidence: row.evidence ? JSON.parse(row.evidence) : undefined,
  };
}

const insertStmt = db.prepare(`
  INSERT INTO memories
    (id, agent_id, kind, description, created_at, last_accessed_at, importance, embedding, evidence)
  VALUES
    (@id, @agentId, @kind, @description, @createdAt, @lastAccessedAt, @importance, @embedding, @evidence)
`);

export function insertMemoryRow(m: MemoryRecord): void {
  insertStmt.run({
    id: m.id,
    agentId: m.agentId,
    kind: m.kind,
    description: m.description,
    createdAt: m.createdAt,
    lastAccessedAt: m.lastAccessedAt,
    importance: m.importance,
    embedding: JSON.stringify(m.embedding),
    evidence: m.evidence ? JSON.stringify(m.evidence) : null,
  });
}

const selectByAgentStmt = db.prepare(`SELECT * FROM memories WHERE agent_id = ?`);
export function selectMemoriesByAgent(agentId: string): MemoryRecord[] {
  return (selectByAgentStmt.all(agentId) as MemoryRow[]).map(rowToMemory);
}

const touchStmt = db.prepare(`UPDATE memories SET last_accessed_at = ? WHERE id = ?`);
export function touchMemory(id: string, when: number): void {
  touchStmt.run(when, id);
}
