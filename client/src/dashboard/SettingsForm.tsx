/**
 * SettingsForm.tsx
 * ----------------
 * Painel de configuração da chave da API da Anthropic. A chave é salva no
 * navegador (localStorage) e pode ser apagada a qualquer momento. Também
 * permite escolher os modelos de raciocínio (Opus) e rápido (Haiku).
 *
 * A chave fica SOMENTE no seu navegador e é usada para chamar a Anthropic
 * diretamente do front — nada é enviado a servidores intermediários.
 */
import { useState } from 'react';
import { useSettings } from '../store/useSettings';

export function SettingsForm() {
  const { apiKey, modelReasoning, modelFast, setApiKey, clearApiKey, setModels } = useSettings();
  const [draft, setDraft] = useState('');
  const [reasoning, setReasoning] = useState(modelReasoning);
  const [fast, setFast] = useState(modelFast);
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    if (draft.trim()) setApiKey(draft.trim());
    setModels(reasoning.trim() || 'claude-opus-4-8', fast.trim() || 'claude-haiku-4-5');
    setDraft('');
    setStatus('Configurações salvas no navegador ✓');
  }

  function clear() {
    clearApiKey();
    setDraft('');
    setStatus('Chave apagada do navegador.');
  }

  const masked = apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : null;

  return (
    <div className="space-y-4">
      <div
        className={`rounded border px-3 py-2 text-xs ${
          apiKey
            ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300'
            : 'border-amber-700 bg-amber-900/20 text-amber-300'
        }`}
      >
        {apiKey ? (
          <>Chave ativa: <span className="font-mono">{masked}</span></>
        ) : (
          'Sem chave: a cidade roda em modo simulado (ações genéricas, sem LLM real).'
        )}
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-slate-400">
          Chave da API Anthropic (sk-ant-...)
        </span>
        <input
          type="password"
          className={inputCls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={apiKey ? '•••• (deixe vazio para manter)' : 'sk-ant-...'}
          autoComplete="off"
        />
        <span className="mt-1 block text-[10px] text-slate-500">
          Salva apenas no seu navegador (localStorage). Obtenha em console.anthropic.com.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Modelo raciocínio</span>
          <input className={inputCls} value={reasoning} onChange={(e) => setReasoning(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Modelo rápido</span>
          <input className={inputCls} value={fast} onChange={(e) => setFast(e.target.value)} />
        </label>
      </div>

      <div className="flex gap-2">
        <button onClick={save} className={btnPrimary}>
          Salvar
        </button>
        <button onClick={clear} disabled={!apiKey} className={btnDanger}>
          Apagar chave
        </button>
      </div>

      {status && <p className="text-xs text-accent">{status}</p>}
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded bg-night border border-slate-700 px-2 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none';
const btnPrimary =
  'flex-1 rounded bg-accent/90 hover:bg-accent text-night font-semibold text-sm py-2 transition';
const btnDanger =
  'flex-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-semibold text-sm py-2 transition disabled:opacity-40';
