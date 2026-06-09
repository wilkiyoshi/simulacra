/**
 * WorldContextForm.tsx
 * --------------------
 * Formulário do "Deus" da simulação: define o contexto global da cidade
 * (cenário, clima, dia da semana, regras e eventos recentes). Esses dados
 * entram em todos os prompts de planejamento dos agentes.
 */
import { useState } from 'react';
import { updateWorldContext } from '../api/client';
import { useWorldStore } from '../store/useWorldStore';

export function WorldContextForm() {
  const ctx = useWorldStore((s) => s.snapshot?.context);
  const [form, setForm] = useState({
    description: '',
    weather: '',
    dayOfWeek: '',
    rules: '',
    recentEvents: '',
  });
  const [status, setStatus] = useState<string | null>(null);

  // Preenche com o contexto atual quando ele chega pela primeira vez.
  const effective = {
    description: form.description || ctx?.description || '',
    weather: form.weather || ctx?.weather || '',
    dayOfWeek: form.dayOfWeek || ctx?.dayOfWeek || '',
    rules: form.rules || ctx?.rules || '',
    recentEvents: form.recentEvents || ctx?.recentEvents || '',
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Atualizando...');
    try {
      await updateWorldContext(effective);
      setStatus('Contexto atualizado ✓');
    } catch {
      setStatus('Erro ao atualizar.');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="O que é a cidade?">
        <textarea
          className={inputCls}
          rows={2}
          value={effective.description}
          onChange={set('description')}
          placeholder="Uma vila litorânea com praça, cafeteria e mercado..."
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Clima">
          <input className={inputCls} value={effective.weather} onChange={set('weather')} placeholder="ensolarado" />
        </Field>
        <Field label="Dia da semana">
          <input className={inputCls} value={effective.dayOfWeek} onChange={set('dayOfWeek')} placeholder="sábado" />
        </Field>
      </div>

      <Field label="Regras globais">
        <textarea className={inputCls} rows={2} value={effective.rules} onChange={set('rules')} placeholder="Os moradores são cordiais..." />
      </Field>

      <Field label="Eventos recentes (afetam a todos)">
        <textarea
          className={inputCls}
          rows={2}
          value={effective.recentEvents}
          onChange={set('recentEvents')}
          placeholder="Hoje é o festival da cidade!"
        />
      </Field>

      <button type="submit" className={btnCls}>
        Aplicar ao mundo
      </button>
      {status && <p className="text-xs text-accent">{status}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  'w-full rounded bg-night border border-slate-700 px-2 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none';
const btnCls =
  'w-full rounded bg-accent/90 hover:bg-accent text-night font-semibold text-sm py-2 transition';
