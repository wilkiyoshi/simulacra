/**
 * App.tsx
 * -------
 * Layout principal: a área de simulação (Phaser) à esquerda e o dashboard de
 * controle à direita.
 */
import { useEffect, useState } from 'react';
import { PhaserGame } from './game/PhaserGame';
import { Dashboard } from './dashboard/Dashboard';
import { fetchHealth } from './api/client';

export function App() {
  const [llmMode, setLlmMode] = useState<string>('...');

  useEffect(() => {
    fetchHealth()
      .then((h) => setLlmMode(h.llm))
      .catch(() => setLlmMode('servidor offline'));
  }, []);

  return (
    <div className="w-screen h-screen flex bg-[#16161e]">
      <main className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-slate-300 font-semibold">🏙️ Mini Cidade Digital</h2>
          <span className="text-xs text-slate-500">LLM: {llmMode}</span>
        </div>
        <div className="flex-1 min-h-0">
          <PhaserGame />
        </div>
      </main>
      <Dashboard />
    </div>
  );
}
