/**
 * Dashboard.tsx
 * -------------
 * Painel de controle lateral: abas para o contexto global e a injeção de
 * personas, além de uma lista viva dos habitantes com sua ação corrente.
 */
import { useState } from 'react';
import { WorldContextForm } from './WorldContextForm';
import { PersonaInjectionForm } from './PersonaInjectionForm';
import { SettingsForm } from './SettingsForm';
import { InsightsPanel } from './InsightsPanel';
import { useWorldStore } from '../store/useWorldStore';

type Tab = 'mundo' | 'twin' | 'insights' | 'habitantes' | 'config';

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('twin');
  const snapshot = useWorldStore((s) => s.snapshot);

  return (
    <aside className="w-[380px] shrink-0 h-full bg-panel/60 border-l border-slate-800 flex flex-col">
      <header className="p-4 border-b border-slate-800">
        <h1 className="text-lg font-bold text-accent">Simulacra</h1>
        <p className="text-xs text-slate-400">Painel do "Criador" da cidade • tick {snapshot?.tick ?? 0}</p>
      </header>

      <nav className="flex border-b border-slate-800 text-xs">
        <TabBtn active={tab === 'twin'} onClick={() => setTab('twin')}>Digital Twin</TabBtn>
        <TabBtn active={tab === 'mundo'} onClick={() => setTab('mundo')}>Contexto</TabBtn>
        <TabBtn active={tab === 'insights'} onClick={() => setTab('insights')}>Insights</TabBtn>
        <TabBtn active={tab === 'habitantes'} onClick={() => setTab('habitantes')}>
          Habitantes ({snapshot?.agents.length ?? 0})
        </TabBtn>
        <TabBtn active={tab === 'config'} onClick={() => setTab('config')}>⚙️</TabBtn>
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'twin' && <PersonaInjectionForm />}
        {tab === 'mundo' && <WorldContextForm />}
        {tab === 'insights' && <InsightsPanel />}
        {tab === 'habitantes' && <AgentList />}
        {tab === 'config' && <SettingsForm />}
      </div>
    </aside>
  );
}

function AgentList() {
  const agents = useWorldStore((s) => s.snapshot?.agents ?? []);
  if (agents.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum habitante ainda. Injete um digital twin para começar.</p>;
  }
  return (
    <ul className="space-y-2">
      {agents.map((a) => (
        <li key={a.id} className="rounded bg-night/60 border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-100">{a.core.name}</span>
            <span className="text-lg">{a.actionEmoji}</span>
          </div>
          <p className="text-xs text-slate-400">{a.core.occupation}</p>
          <p className="text-xs text-accent mt-1">{a.currentAction}</p>
          {a.speech && <p className="text-xs italic text-slate-300 mt-1">“{a.speech}”</p>}
        </li>
      ))}
    </ul>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 transition ${
        active ? 'bg-night text-accent font-semibold' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
