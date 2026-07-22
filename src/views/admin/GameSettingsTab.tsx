import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { store } from '../../lib/store';
import { Save, RefreshCw, Settings, CheckCircle2, AlertCircle } from 'lucide-react';

/** Canonical 8 games — in display order */
const GAME_SLUGS = [
  { slug: 'wingo',     label: 'WinGo' },
  { slug: 'k3',        label: 'K3 Dice' },
  { slug: 'fived',     label: '5D Lottery' },
  { slug: 'crash',     label: 'Crash' },
  { slug: 'aviator',   label: 'Aviator' },
  { slug: 'mines',     label: 'Mines' },
  { slug: 'sunvsmoon', label: 'Sun vs Moon' },
  { slug: 'trading',   label: 'Trading Game' },
];

const SLUG_SET = new Set(GAME_SLUGS.map(g => g.slug));

interface GameRow {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  is_active: boolean;
  min_bet: number;
  max_bet: number;
  category: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function GameSettingsTab() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});

  useEffect(() => { void loadGames(); }, []);

  async function loadGames() {
    setLoading(true);
    const { data } = await supabase.from('games').select('*');
    const rows = (data ?? []) as GameRow[];

    // Keep only the 8 known slugs, sorted in canonical GAME_SLUGS order
    const bySlug = Object.fromEntries(rows.map(r => [r.slug, r]));
    const ordered = GAME_SLUGS
      .filter(({ slug }) => SLUG_SET.has(slug))
      .map(({ slug }) => bySlug[slug] ?? null)
      .filter((r): r is GameRow => r !== null);

    setGames(ordered);
    setLoading(false);
  }

  async function saveGame(game: GameRow) {
    setSaveStatus(s => ({ ...s, [game.id]: 'saving' }));
    setSaveMsg(s => ({ ...s, [game.id]: '' }));
    try {
      // 1. Save to Supabase games table
      const { error } = await supabase.from('games').update({
        is_active:    game.is_active,
        min_bet:      game.min_bet,
        max_bet:      game.max_bet,
        display_name: game.display_name,
        updated_at:   new Date().toISOString(),
      }).eq('id', game.id);

      if (error) throw new Error(error.message);

      // 2. Sync limits into store.perGameLimits → also persists to admin_config in Supabase
      store.setGameLimit(game.slug, { min: game.min_bet, max: game.max_bet });

      // 3. Reload to confirm round-trip
      await store.loadAdminConfigFromSupabase();

      setSaveStatus(s => ({ ...s, [game.id]: 'saved' }));
      setSaveMsg(s => ({ ...s, [game.id]: 'Supabase confirmed ✓' }));
      setTimeout(() => setSaveStatus(s => ({ ...s, [game.id]: 'idle' })), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveStatus(s => ({ ...s, [game.id]: 'error' }));
      setSaveMsg(s => ({ ...s, [game.id]: msg }));
    }
  }

  function update(id: string, patch: Partial<GameRow>) {
    setGames(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g));
    // Reset save status when any field changes
    setSaveStatus(s => ({ ...s, [id]: 'idle' }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-neon-400" />
        <h2 className="text-lg font-bold">Game Settings</h2>
        <span className="text-xs text-slate-500 ml-1">({games.length} / 8 games)</span>
        <button
          onClick={() => { void loadGames(); }}
          className="ml-auto p-2 bg-slatepanel-700 rounded-lg hover:bg-slatepanel-600 transition"
        >
          <RefreshCw className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      <div className="space-y-3">
        {games.map(g => {
          const status = saveStatus[g.id] ?? 'idle';
          const msg    = saveMsg[g.id] ?? '';
          return (
            <div key={g.id} className="bg-slatepanel-800 rounded-2xl p-4 space-y-3 border border-borderline-900">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white">{g.display_name}</h3>
                  <span className="text-slate-500 text-xs font-mono">{g.slug}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${g.is_active ? 'text-neon-400' : 'text-red-400'}`}>
                    {g.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => update(g.id, { is_active: !g.is_active })}
                    className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${g.is_active ? 'bg-neon-500' : 'bg-slatepanel-600'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${g.is_active ? 'translate-x-7' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Display Name</label>
                  <input
                    value={g.display_name}
                    onChange={e => update(g.id, { display_name: e.target.value })}
                    className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-400/60"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Min Bet (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={g.min_bet}
                    onChange={e => update(g.id, { min_bet: Number(e.target.value) })}
                    className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-400/60"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Max Bet (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={g.max_bet}
                    onChange={e => update(g.id, { max_bet: Number(e.target.value) })}
                    className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-400/60"
                  />
                </div>
              </div>

              {/* Footer row */}
              <div className="flex items-center justify-between">
                <div className="text-xs min-h-[1.25rem]">
                  {status === 'saved' && (
                    <span className="flex items-center gap-1 text-neon-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {msg}
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {msg}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { void saveGame(g); }}
                  disabled={status === 'saving'}
                  className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 rounded-lg text-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {status === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}

        {games.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No games found in database. Make sure the games table has rows for the 8 supported slugs.
          </div>
        )}
      </div>
    </div>
  );
}
