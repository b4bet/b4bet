import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Save, RefreshCw, Settings } from 'lucide-react';

const GAME_SLUGS = [
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
    // Filter to only show the allowed game slugs
    const allowed = new Set(GAME_SLUGS.map(g => g.slug));
    setGames(((data ?? []) as GameRow[]).filter(g => allowed.has(g.slug)));
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

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-neon-300" />
        <h2 className="font-display font-bold text-white">Game Settings</h2>
        <button onClick={loadGames} className="ml-auto p-1.5 rounded-lg bg-slatepanel-800 hover:bg-slatepanel-700">
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="space-y-3">
        {games.map(g => (
          <div key={g.id} className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{g.display_name}</p>
                <p className="text-xs text-slate-500">{g.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${g.is_active ? 'text-emeraldwin-400' : 'text-slate-500'}`}>
                  {g.is_active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => update(g.id, { is_active: !g.is_active })}
                  className={`w-12 h-6 rounded-full transition ${
                    g.is_active ? 'bg-neon-500' : 'bg-slatepanel-600'
                  }`}>
                  <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    g.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Display Name</label>
                <input value={g.display_name} onChange={e => update(g.id, { display_name: e.target.value })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Min Bet (paise)</label>
                <input type="number" value={g.min_bet} onChange={e => update(g.id, { min_bet: Number(e.target.value) })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Max Bet (paise)</label>
                <input type="number" value={g.max_bet} onChange={e => update(g.id, { max_bet: Number(e.target.value) })}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <button onClick={() => saveGame(g)} disabled={saving === g.id}
              className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 rounded-lg text-sm transition disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving === g.id ? 'Saving...' : 'Save'}
            </button>
          </div>
        ))}
        {games.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No games found in database.</p>}
      </div>
    </div>
  );
}
