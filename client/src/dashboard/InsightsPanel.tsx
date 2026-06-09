/**
 * InsightsPanel.tsx
 * -----------------
 * Aba "Insights": a IA acompanha as ações e conversas dos digital twins e
 * gera observações de alto nível sobre o que está acontecendo e o
 * comportamento deles. Atualiza automaticamente; também há um botão para
 * gerar sob demanda.
 */
import { useInsights } from '../store/useInsights';
import { requestInsight } from '../engine/simulation';

export function InsightsPanel() {
  const items = useInsights((s) => s.items);
  const generating = useInsights((s) => s.generating);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        A IA observa as ações e interações dos digital twins e sintetiza insights sobre a
        dinâmica da cidade. Gera automaticamente a cada ~30s.
      </p>

      <button
        onClick={() => void requestInsight()}
        disabled={generating}
        className="w-full rounded bg-accent/90 py-2 text-sm font-semibold text-night transition hover:bg-accent disabled:opacity-60"
      >
        {generating ? 'Analisando a cidade…' : '✨ Gerar insight agora'}
      </button>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Ainda sem insights. Injete digital twins e aguarde-os interagir — ou clique acima.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded border border-slate-800 bg-night/60 p-3">
              <p className="text-sm text-slate-100">{it.text}</p>
              <span className="mt-1 block text-[10px] text-slate-500">
                {new Date(it.at).toLocaleTimeString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
