/**
 * useSettings.ts
 * --------------
 * Estado das configurações do usuário, persistido no navegador (localStorage).
 * Guarda a chave da API da Anthropic e os modelos usados. A chave NUNCA sai
 * do navegador do usuário a não ser nas chamadas diretas à API da Anthropic.
 */
import { create } from 'zustand';

const LS_API_KEY = 'simulacra.apiKey';
const LS_MODEL_REASONING = 'simulacra.modelReasoning';
const LS_MODEL_FAST = 'simulacra.modelFast';

const DEFAULT_REASONING = 'claude-opus-4-8';
const DEFAULT_FAST = 'claude-haiku-4-5';

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

interface SettingsState {
  apiKey: string;
  modelReasoning: string;
  modelFast: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setModels: (reasoning: string, fast: string) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  apiKey: read(LS_API_KEY, ''),
  modelReasoning: read(LS_MODEL_REASONING, DEFAULT_REASONING),
  modelFast: read(LS_MODEL_FAST, DEFAULT_FAST),

  setApiKey: (key) => {
    try {
      localStorage.setItem(LS_API_KEY, key);
    } catch {
      /* localStorage indisponível (modo privado) — mantém só em memória */
    }
    set({ apiKey: key });
  },

  clearApiKey: () => {
    try {
      localStorage.removeItem(LS_API_KEY);
    } catch {
      /* ignore */
    }
    set({ apiKey: '' });
  },

  setModels: (reasoning, fast) => {
    try {
      localStorage.setItem(LS_MODEL_REASONING, reasoning);
      localStorage.setItem(LS_MODEL_FAST, fast);
    } catch {
      /* ignore */
    }
    set({ modelReasoning: reasoning, modelFast: fast });
  },
}));

// Acessores fora de componentes React (usados pela camada de LLM).
export const getApiKey = (): string => useSettings.getState().apiKey;
export const getModels = (): { reasoning: string; fast: string } => {
  const s = useSettings.getState();
  return { reasoning: s.modelReasoning, fast: s.modelFast };
};
export const hasLLM = (): boolean => getApiKey().trim().length > 0;
