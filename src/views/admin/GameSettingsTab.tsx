import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { store } from '@/lib/store';
import {
  Save, RefreshCw, Settings, ToggleLeft, ToggleRight,
  AlertTriangle, CheckCircle, Gamepad2, TrendingUp, Coins,
  Zap, Sun, Layers, Info,
} from 'lucide-react';

// ── Game icon/color metadata ──────────────────────────────────────────────────
type GameMeta = { label: string; icon: React.ElementType; color: string; bg: string };

const GAME_META: Record<string, GameMeta> = {
  crash:     { label: 'Crash',       icon: Zap,        color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  aviator:   { label: 'Aviator',     icon: TrendingUp, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  mines:     { label: 'Mines',       icon: Gamepad2,   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  sunvsmoon: { label: 'Sun vs Moon', icon: Sun,        color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  trading:   { label: 'Trading',     icon: Coins,      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
};

const DEFAULT_META: GameMeta = {
  label: '', icon: Layers, color: 'text-slate-400', bg: 'bg-slate-700/30 border-slate-600/30',
};

// ── Types ────────────────────────────────────────────────────────────────────
interface GameRow {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  is_active: boolean;
  min_bet: number;
  default_bet: number;
  max_bet: number;
  category: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Component ────────────────────────────────────────────────────────────────
export default function GameSettingsTab() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from('games')
      .select('id, slug, name, display_name, is_active, min_bet, default_bet, max_bet, category')
      .order('name');

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    setGames((data ?? []) as GameRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadGames(); }, [loadGames]);

  function update(id: string, patch: Partial<GameRow>) {
    setGames(gs => gs.map(g => (g.id === id ? { ...g, ...patch } : g)));
  }

  async function saveGame(game: GameRow) {
    // Validation: default_bet must be between min and max
    if (game.min_bet > game.max_bet) return;
    if (game.default_bet < game.min_bet || game.default_bet > game.max_bet) return;

    setSaveStatus(s => ({ ...s, [game.id]: 'saving' }));

    const { error } = await supabase
      .from('games')
      .update({
        is_active: game.is_active,
        min_bet: game.min_bet,
        default_bet: game.default_bet,
        max_bet: game.max_bet,
        display_name: game.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', game.id);

    if (error) {
      setSaveStatus(s => ({ ...s, [game.id]: 'error' }));
      setTimeout(() => setSaveStatus(s => ({ ...s, [game.id]: 'idle' })), 3000);
      return;
    }

    setSaveStatus(s => ({ ...s, [game.id]: 'saved' }));
    setTimeout(() => setSaveStatus(s => ({ ...s, [game.id]: 'idle' })), 2500);

    // Refresh in-memory limits + default bets so games pick up new values without page reload
    await store.loadGameLimitsFromGamesTable();
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 py-16">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Game settings load ho rahi hain...</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Supabase Error</p>
            <p className="text-xs text-red-400/80 mt-1">{fetchError}</p>
          </div>
        </div>
        <button
          onClick={() => void loadGames()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Dobara try karein
        </button>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (games.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Gamepad2 className="w-10 h-10 text-slate-600" />
        <p className="font-semibold text-slate-400">Koi game nahi mila</p>
        <button
          onClick={() => void loadGames()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-violet-400" />
        <h2 className="font-bold text-white text-sm">Game Settings</h2>
        <button
          onClick={() => void loadGames()}
          className="ml-auto p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-300">
          Amounts <strong>paise</strong> mein hain — 100 paise = ₹1.
          Save karte hi games mein turant enforce hoga.
        </p>
      </div>

      {/* Game cards */}
      <div className="space-y-3">
        {games.map(g => {
          const meta = GAME_META[g.slug] ?? { ...DEFAULT_META, label: g.display_name };
          const Icon = meta.icon;
          const status = saveStatus[g.id] ?? 'idle';
          const hasMinMaxError = g.min_bet > g.max_bet;
          const hasDefaultError = g.default_bet < g.min_bet || g.default_bet > g.max_bet;
          const hasError = hasMinMaxError || hasDefaultError;

          return (
            <div key={g.id} className={`rounded-xl border p-4 space-y-3 ${meta.bg}`}>

              {/* Name + active toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-5 h-5 ${meta.color} flex-shrink-0`} />
                  <div>
                    <p className="font-semibold text-white text-sm">{g.display_name}</p>
                    <p className="text-[11px] text-slate-500">{g.slug}</p>
                  </div>
                </div>
                <button
                  onClick={() => update(g.id, { is_active: !g.is_active })}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  {g.is_active
                    ? <ToggleRight className="w-8 h-8 text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-slate-500" />}
                  <span className={`text-xs font-semibold hidden sm:block ${
                    g.is_active ? 'text-green-400' : 'text-slate-500'
                  }`}>
                    {g.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              </div>

              {/* Display Name — full width row */}
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Display Name</label>
                <input
                  value={g.display_name}
                  onChange={e => update(g.id, { display_name: e.target.value })}
                  className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors"
                />
              </div>

              {/* 3 bet amount inputs */}
              <div className="grid grid-cols-3 gap-2">
                {/* Default Bet */}
                <div>
                  <label className="text-[11px] text-violet-300 mb-1 block font-semibold">
                    Default Bet <span className="text-slate-600 font-normal">(paise)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={g.default_bet}
                    onChange={e => update(g.id, { default_bet: Number(e.target.value) })}
                    className={`w-full bg-slate-900/60 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                      hasDefaultError ? 'border-red-500/60' : 'border-violet-500/50 focus:border-violet-400'
                    }`}
                  />
                  <p className="text-[10px] text-violet-400/70 mt-0.5">₹{(g.default_bet / 100).toFixed(2)}</p>
                </div>

                {/* Min Bet */}
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Min Bet <span className="text-slate-600">(paise)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={g.min_bet}
                    onChange={e => update(g.id, { min_bet: Number(e.target.value) })}
                    className={`w-full bg-slate-900/60 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                      hasMinMaxError ? 'border-red-500/60' : 'border-slate-700/60 focus:border-violet-500'
                    }`}
                  />
                  <p className="text-[10px] text-slate-600 mt-0.5">₹{(g.min_bet / 100).toFixed(2)}</p>
                </div>

                {/* Max Bet */}
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">
                    Max Bet <span className="text-slate-600">(paise)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={g.max_bet}
                    onChange={e => update(g.id, { max_bet: Number(e.target.value) })}
                    className={`w-full bg-slate-900/60 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                      hasMinMaxError ? 'border-red-500/60' : 'border-slate-700/60 focus:border-violet-500'
                    }`}
                  />
                  <p className="text-[10px] text-slate-600 mt-0.5">₹{(g.max_bet / 100).toFixed(2)}</p>
                </div>
              </div>

              {/* Validation errors */}
              {hasMinMaxError && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300">Min bet, max bet se zyada nahi ho sakta</p>
                </div>
              )}
              {hasDefaultError && !hasMinMaxError && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300">Default bet, min aur max ke beech hona chahiye</p>
                </div>
              )}

              <button
                onClick={() => void saveGame(g)}
                disabled={status === 'saving' || hasError}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  status === 'saved'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : status === 'error'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 border border-violet-500/30'
                }`}
              >
                {status === 'saving' && <div className="w-3.5 h-3.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />}
                {status === 'saved' && <CheckCircle className="w-3.5 h-3.5" />}
                {status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                {status === 'idle' && <Save className="w-4 h-4" />}
                {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved!' : status === 'error' ? 'Error — Retry' : 'Save'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
