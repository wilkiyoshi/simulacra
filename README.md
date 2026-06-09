# 🏙️ Simulacra — Mini Cidade Digital

Uma aplicação web interativa onde personas sintéticas autônomas habitam uma
cidade 2D em pixel art e se comportam de forma coerente ao longo do tempo.
A arquitetura cognitiva é baseada no artigo da Universidade de Stanford
**"Generative Agents: Interactive Simulacra of Human Behavior"**
([arxiv 2304.03442](https://arxiv.org/pdf/2304.03442)).

---

## 1. Stack tecnológica

| Camada | Tecnologia | Por quê |
|---|---|---|
| **Frontend (UI)** | React 18 + TypeScript + Vite + TailwindCSS + Zustand | DX rápida, build instantâneo, estado mínimo e reativo |
| **Frontend (Jogo)** | Phaser 3 (Canvas/WebGL) | Engine 2D madura para pixel art, tilemaps, sprite sheets e animações |
| **Tempo real** | Socket.IO | Stream do estado do mundo a cada tick, sem polling |
| **Backend** | Node.js 20 + TypeScript + Fastify | Servidor HTTP rápido e tipado; mesma linguagem do front |
| **IA / LLM** | SDK oficial `@anthropic-ai/sdk` (Claude) | Opus 4.8 para reflexão/planejamento; Haiku 4.5 para ações por tick |
| **Memória** | SQLite (`better-sqlite3`) + embeddings | Memory Stream relacional com busca semântica; migra para banco vetorial sem mudar a API |

### Estratégia anti-latência
- **Dois modelos por papel**: o caro (Opus, raciocínio profundo) só roda em
  reflexão e plano diário; o barato/rápido (Haiku) roda nas ações de cada tick.
- **Embeddings locais determinísticos** evitam round-trips de rede no Retrieval.
- **Tick assíncrono com trava** (`stepping`) impede ticks concorrentes enquanto
  chamadas ao LLM estão em voo.
- **Modo simulado**: sem `ANTHROPIC_API_KEY`, os agentes ainda se movem e agem
  com respostas determinísticas — permite desenvolver o frontend offline.

---

## 2. Estrutura de pastas

```
simulacra/
├── server/                         # Backend (Node + TS)
│   └── src/
│       ├── config.ts               # Variáveis de ambiente
│       ├── index.ts                # Fastify + Socket.IO + rotas REST
│       ├── llm/
│       │   ├── anthropic.ts        # Wrapper do SDK da Anthropic (complete / completeJSON)
│       │   └── embeddings.ts       # Provedor de embeddings + similaridade de cosseno
│       ├── cognition/              # ★ Arquitetura cognitiva (o coração do projeto)
│       │   ├── types.ts            # Tipos centrais (MemoryRecord, PersonaCore...)
│       │   ├── MemoryStream.ts     # ★ Fluxo de Memória
│       │   ├── Retrieval.ts        # Recência + Importância + Relevância
│       │   ├── Reflection.ts       # Síntese de crenças de alto nível
│       │   ├── Planning.ts         # Plano diário + ação por tick + reação
│       │   └── GenerativeAgent.ts  # ★ Classe que integra todos os módulos
│       ├── world/
│       │   └── World.ts            # Sandbox: grade, loop de ticks, interações
│       └── db/
│           └── database.ts         # SQLite (persistência do Memory Stream)
│
└── client/                         # Frontend (React + Vite)
    └── src/
        ├── App.tsx                 # Layout (jogo + dashboard)
        ├── types.ts                # Espelho dos tipos do backend
        ├── api/client.ts           # REST + Socket.IO
        ├── store/useWorldStore.ts  # Estado global (zustand)
        ├── game/
        │   ├── PhaserGame.tsx      # Monta/desmonta o Phaser
        │   ├── scenes/CityScene.ts # Mapa, texturas e sincronização do mundo
        │   └── sprites/AgentSprite.ts # Sprite animado + balão de fala
        └── dashboard/
            ├── Dashboard.tsx
            ├── WorldContextForm.tsx     # Contexto global (o "Deus")
            └── PersonaInjectionForm.tsx # ★ Injeção de nova persona
```

---

## 3. Mapeamento ao artigo de Stanford

| Conceito do artigo | Arquivo | Resumo |
|---|---|---|
| **Memory Stream** | `cognition/MemoryStream.ts` | Registro em linguagem natural com timestamp + importância + embedding |
| **Retrieval** | `cognition/Retrieval.ts` | `score = α·recência + β·importância + γ·relevância` (normalizado min-max) |
| **Reflection** | `cognition/Reflection.ts` | Dispara por limiar de importância; gera perguntas-foco → inferências com evidências |
| **Planning & Reacting** | `cognition/Planning.ts` | Plano diário (Opus) → ação por tick (Haiku) → reação a eventos inesperados |
| **Agent** | `cognition/GenerativeAgent.ts` | Costura os módulos numa persona viva (Figura 2 do artigo) |

---

## 4. Como rodar

```bash
# 1. Instalar dependências (workspaces)
npm install

# 2. Configurar o ambiente do backend
cp .env.example server/.env
#   edite server/.env e cole sua ANTHROPIC_API_KEY
#   (sem chave, roda em "modo simulado")

# 3. Subir backend e frontend
npm run dev:server      # http://localhost:3001
npm run dev:client      # http://localhost:5173
```

Abra `http://localhost:5173`, vá à aba **Nova Persona**, preencha e clique em
**Injetar persona**. O agente aparece na cidade e começa a viver sua rotina;
ao se aproximar de outro, balões de fala mostram a conversa gerada pelo LLM.

---

## Próximos passos sugeridos
- Trocar o passeio aleatório por *pathfinding* (A*) rumo a locais do roteiro.
- Substituir embeddings locais por Voyage AI para relevância semântica melhor.
- Importar tilemaps (Tiled) e sprite sheets reais — os nomes de textura/frame
  já seguem um padrão estável (`char-<spriteKey>`, frames `down-0`, etc.).
- Persistir agentes (não só memórias) para retomar a simulação após reiniciar.
