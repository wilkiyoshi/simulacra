/**
 * App.tsx
 * -------
 * Layout principal: área de simulação (Phaser) à esquerda e dashboard à direita.
 * O selo de status do LLM reage à chave configurada nas Configurações.
 */
import { CityCanvas } from './game/city3d/CityCanvas';
import { Dashboard } from './dashboard/Dashboard';
import { useSettings } from './store/useSettings';

export function App() {
  const hasKey = useSettings((s) => s.apiKey.trim().length > 0);

  return (
    <div className="w-screen h-screen flex bg-[#16161e]">
      <main className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-slate-300 font-semibold">🏙️ Mini Cidade Digital</h2>
          <span
            className={`text-xs px-2 py-1 rounded ${
              hasKey ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/30 text-amber-300'
            }`}
          >
            LLM: {hasKey ? 'conectado (navegador)' : 'modo simulado — configure sua chave ⚙️'}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <CityCanvas />
        </div>
      </main>
      <Dashboard />
    </div>
  );
}
