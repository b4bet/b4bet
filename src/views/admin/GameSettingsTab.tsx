import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Save, RefreshCw, Settings } from 'lucide-react';

const GAME_SLUGS = [
  { slug: 'wingo', label: 'WinGo' },
  { slug: 'k3', label: 'K3 Dice' },
  { slug: 'fived', label: '5D Lottery' },
  { slug: 'crash', label: 'Crash' },
  { slug: 'aviator', label: 'Aviator' },
  { slug: 'mines', label: 'Mines' },
  { slug: 'sunvsmoon', label: 'Sun vs Moon' },
  { slug: 'trading', label: 'Trading Game' },
];

interface GameRow {
  id: string; slug: string; name: string; display_name: string;
  is_active: boolean; min_bet: number; max_bet: number; category: string;
}

export default function GameSettingsTab() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { loadGames(); }, []);

  async function loadGames() {
    setLoading(true);
    const { data } = await supabase.from('games').select('*').order('name');
    setGames((data ?? []) as GameRow[]);
    setLoading(false);
  }

  async function saveGame(game: GameRow) {
    setSaving(game.id);
    await supabase.from('games').update({
      is_active: game.is_active,
      min_bet: game.min_bet,
      max_bet: game.max_bet,
      display_name: game.display_name,
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);
    setSaving(null);
  }

  function update(id: string, patch: Partial<GameRow>) {
    setGames(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-neon-400" />
        <h2 className="text-lg font-bold">Game Settings</h2>
        <button onClick={loadGames} className="ml-auto p-2 bg-slatepanel-700 rounded-lg hover:bg-slatepanel-600 transition">
          <RefreshCw className="w-4 h-4 text-slate-300" />
        </button>
      </div>
      <div className="space-y-3">
        {games.map(g => (
          <div key={g.id} className="bg-slatepanel-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{g.display_name}</h3>
                <span className="text-slate-500 text-xs font-mono">{g.slug}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${g.is_active ? 'text-neon-400' : 'text-red-400'}`}>{g.is_active ? 'Active' : 'Inactive'}</span>
                <button onClick={() => update(g.id, { is_active: !g.is_active })}
                  className={`w-12 h-6 rounded-full transition ${
                    g.is_active ? 'bg-neon-500' : 'bg-slatepanel-600'
                  }`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    g.is_active ? 'translate-x-7' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Display Name</label>
                <input value={g.display_name} onChange={e => update(g.id, { display_name: e.target.value })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Min Bet (paise)</label>
                <input type="number" value={g.min_bet} onChange={e => update(g.id, { min_bet: Number(e.target.value) })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Max Bet (paise)</label>
                <input type="number" value={g.max_bet} onChange={e => update(g.id, { max_bet: Number(e.target.value) })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => saveGame(g)} disabled={saving === g.id}
                className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 rounded-lg text-sm transition disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saving === g.id ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
        {games.length === 0 && <div className="text-center py-12 text-slate-500">No games found in database.</div>}
      </div>
    </div>
  );
}
