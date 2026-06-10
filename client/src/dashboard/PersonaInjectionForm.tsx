/**
 * PersonaInjectionForm.tsx
 * ------------------------
 * Formulário para criar e injetar um digital twin. Suporta preenchimento
 * manual OU upload de um arquivo .md que descreve o twin. Mostra uma prévia
 * do "sprite" (cores de camisa/pele) ao lado do campo de sprite.
 */
import { useState } from 'react';
import { injectPersona } from '../api/client';
import type { PersonaInjection } from '../types';

const SPRITE_OPTIONS = ['villager', 'baker', 'farmer', 'merchant', 'artist', 'doctor', 'worker'];

const SKIN_OPTIONS = [
  { hex: '', label: 'Padrão' },
  { hex: '#f0c9a8', label: 'Clara' },
  { hex: '#c79a6b', label: 'Parda' },
  { hex: '#a9744f', label: 'Morena' },
  { hex: '#6b4a33', label: 'Negra' },
  { hex: '#caa472', label: 'Indígena' },
];

const EMPTY = {
  name: '',
  age: 30,
  occupation: '',
  appearance: '',
  traits: '',
  spriteKey: 'villager',
  skin: '',
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

  async function onMarkdown(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = parseTwinMarkdown(text);
    setForm((f) => ({ ...f, ...parsed }));
    setStatus({ kind: 'ok', msg: `Arquivo "${file.name}" carregado — revise e injete.` });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.occupation.trim() || !form.traits.trim()) {
      setStatus({ kind: 'err', msg: 'Nome, ocupação e traços são obrigatórios.' });
      return;
    }
    setStatus({ kind: 'loading', msg: 'Injetando digital twin na cidade...' });
    const payload: PersonaInjection = {
      core: {
        name: form.name.trim(),
        age: form.age,
        occupation: form.occupation.trim(),
        appearance: form.appearance.trim(),
        traits: form.traits.trim(),
        spriteKey: form.spriteKey,
        skin: form.skin || undefined,
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
      <label className="flex cursor-pointer items-center justify-between rounded border border-dashed border-slate-600 bg-night/40 px-3 py-2 text-xs text-slate-300 hover:border-accent">
        <span>📄 Construir a partir de um arquivo <b>.md</b></span>
        <span className="rounded bg-slate-700 px-2 py-0.5">Selecionar</span>
        <input type="file" accept=".md,text/markdown" className="hidden" onChange={onMarkdown} />
      </label>

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

      <Field label="Descrição física">
        <input className={inputCls} value={form.appearance} onChange={set('appearance')} placeholder="cabelos castanhos, avental vermelho" />
      </Field>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Field label="Sprite">
          <select className={inputCls} value={form.spriteKey} onChange={set('spriteKey')}>
            {SPRITE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tom de pele">
          <select className={inputCls} value={form.skin} onChange={set('skin')}>
            {SKIN_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.hex}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <SpritePreview spriteKey={form.spriteKey} name={form.name} skin={form.skin} />
      </div>

      <Field label="Core Traits — personalidade, forma de pensar e agir">
        <textarea className={inputCls} rows={3} value={form.traits} onChange={set('traits')} placeholder="acolhedora, curiosa, sonha em transformar a cafeteria em ponto de encontro" />
      </Field>

      <Field label="Histórico passado (uma memória por linha → Memory Stream)">
        <textarea className={inputCls} rows={3} value={form.backstory} onChange={set('backstory')} placeholder={'Abriu a cafeteria há 5 anos.\nVenceu o concurso de doces da vila.'} />
      </Field>

      <Field label="Relacionamentos preexistentes (um por linha)">
        <textarea className={inputCls} rows={2} value={form.relationships} onChange={set('relationships')} placeholder={'É amiga de longa data de Tom.'} />
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

/** Prévia do personagem (camisa + cabeça com tom de pele). */
function SpritePreview({ spriteKey, name, skin }: { spriteKey: string; name: string; skin: string }) {
  let h = 0;
  for (const ch of spriteKey + name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shirt = `hsl(${h % 360}, 60%, 55%)`;
  const head = skin || '#e7b48f';
  return (
    <div className="flex flex-col items-center pb-1" title="prévia do personagem">
      <div className="h-4 w-4 rounded-full border border-black/30" style={{ background: head }} />
      <div className="-mt-0.5 h-5 w-6 rounded-sm border border-black/30" style={{ background: shirt }} />
    </div>
  );
}

function parseTwinMarkdown(md: string): Partial<typeof EMPTY> {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const out: Partial<typeof EMPTY> = {};
  const back: string[] = [];
  const rel: string[] = [];
  let section: 'backstory' | 'relationships' | null = null;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const low = norm(line.replace(/^#+\s*/, ''));

    if (low.startsWith('hist') || low.startsWith('backstory') || low.startsWith('memor')) {
      section = 'backstory';
      continue;
    }
    if (low.startsWith('relac') || low.startsWith('relationship')) {
      section = 'relationships';
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet && section) {
      (section === 'backstory' ? back : rel).push(bullet[1].trim());
      continue;
    }

    const kv = line.replace(/^#+\s*/, '').match(/^([^:=]+)[:=]\s*(.+)$/);
    if (kv) {
      const k = norm(kv[1]);
      const val = kv[2].trim();
      if (k.startsWith('nome')) out.name = val;
      else if (k.startsWith('idade')) out.age = parseInt(val, 10) || undefined;
      else if (k.startsWith('ocup')) out.occupation = val;
      else if (k.startsWith('apar') || k.startsWith('fisic')) out.appearance = val;
      else if (k.startsWith('trac') || k.startsWith('person')) out.traits = val;
      else if (k.startsWith('sprite')) out.spriteKey = SPRITE_OPTIONS.includes(val.toLowerCase()) ? val.toLowerCase() : 'villager';
      else if (k.startsWith('pele') || k.startsWith('skin')) out.skin = val;
      section = null;
    }
  }

  if (back.length) out.backstory = back.join('\n');
  if (rel.length) out.relationships = rel.join('\n');
  return out;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded bg-night border border-slate-700 px-2 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none';
const btnCls = 'w-full rounded bg-emerald-500/90 hover:bg-emerald-500 text-night font-bold text-sm py-2 transition disabled:opacity-60';
