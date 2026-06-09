/**
 * PersonaInjectionForm.tsx  ★ DELIVERABLE PRINCIPAL DO FRONTEND ★
 * ---------------------------------------------------------------
 * Formulário detalhado para criar e injetar uma nova persona sintética na
 * cidade em tempo real. Cobre todos os campos pedidos:
 *   - Nome, Idade, Ocupação
 *   - Descrição física (amarra com o sprite)
 *   - Core Traits (personalidade / forma de pensar e agir)
 *   - Histórico passado (sementes do Memory Stream) — uma memória por linha
 *   - Relacionamentos preexistentes — um por linha
 *
 * Ao enviar, faz POST /api/personas; o backend cria o GenerativeAgent,
 * semeia seu Memory Stream e o insere no mundo, que então transmite o novo
 * sprite a todos os clientes via Socket.IO.
 */
import { useState } from 'react';
import { injectPersona } from '../api/client';
import type { PersonaInjection } from '../types';

/** Opções de sprite (paletas distintas geradas no client). */
const SPRITE_OPTIONS = ['villager', 'baker', 'artist', 'farmer', 'merchant', 'doctor'];

const EMPTY = {
  name: '',
  age: 30,
  occupation: '',
  appearance: '',
  traits: '',
  spriteKey: 'villager',
  backstory: '',
  relationships: '',
};

export function PersonaInjectionForm() {
  const [form, setForm] = useState({ ...EMPTY });
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'loading'; msg: string } | null>(null);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: k === 'age' ? Number(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.occupation.trim() || !form.traits.trim()) {
      setStatus({ kind: 'err', msg: 'Nome, ocupação e traços são obrigatórios.' });
      return;
    }
    setStatus({ kind: 'loading', msg: 'Injetando digital twin na cidade...' });

    // Cada linha não-vazia vira uma memória/relacionamento separado.
    const payload: PersonaInjection = {
      core: {
        name: form.name.trim(),
        age: form.age,
        occupation: form.occupation.trim(),
        appearance: form.appearance.trim(),
        traits: form.traits.trim(),
        spriteKey: form.spriteKey,
      },
      backstory: splitLines(form.backstory),
      relationships: splitLines(form.relationships),
    };

    try {
      await injectPersona(payload);
      setStatus({ kind: 'ok', msg: `${payload.core.name} chegou à cidade ✓` });
      setForm({ ...EMPTY });
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Erro ao injetar.' });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Nome" className="col-span-2">
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Isabella Rodriguez" />
        </Field>
        <Field label="Idade">
          <input type="number" min={0} max={130} className={inputCls} value={form.age} onChange={set('age')} />
        </Field>
      </div>

      <Field label="Ocupação">
        <input className={inputCls} value={form.occupation} onChange={set('occupation')} placeholder="dona da cafeteria" />
      </Field>

      <Field label="Descrição física (define o sprite)">
        <input
          className={inputCls}
          value={form.appearance}
          onChange={set('appearance')}
          placeholder="cabelos castanhos, avental vermelho, sorriso caloroso"
        />
      </Field>

      <Field label="Sprite">
        <select className={inputCls} value={form.spriteKey} onChange={set('spriteKey')}>
          {SPRITE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Core Traits — personalidade, forma de pensar e agir">
        <textarea
          className={inputCls}
          rows={3}
          value={form.traits}
          onChange={set('traits')}
          placeholder="acolhedora, curiosa, sonha em transformar a cafeteria em ponto de encontro da vila"
        />
      </Field>

      <Field label="Histórico passado (uma memória por linha → Memory Stream)">
        <textarea
          className={inputCls}
          rows={3}
          value={form.backstory}
          onChange={set('backstory')}
          placeholder={'Abriu a cafeteria há 5 anos.\nVenceu o concurso de doces da vila.'}
        />
      </Field>

      <Field label="Relacionamentos preexistentes (um por linha)">
        <textarea
          className={inputCls}
          rows={2}
          value={form.relationships}
          onChange={set('relationships')}
          placeholder={'É amiga de longa data de Tom.\nMaria é sua sócia na cafeteria.'}
        />
      </Field>

      <button type="submit" disabled={status?.kind === 'loading'} className={btnCls}>
        {status?.kind === 'loading' ? 'Injetando...' : '+ Injetar digital twin'}
      </button>

      {status && status.kind !== 'loading' && (
        <p className={`text-xs ${status.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{status.msg}</p>
      )}
    </form>
  );
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  'w-full rounded bg-night border border-slate-700 px-2 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none';
const btnCls =
  'w-full rounded bg-emerald-500/90 hover:bg-emerald-500 text-night font-bold text-sm py-2 transition disabled:opacity-60';
