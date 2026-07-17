// Game logos — now fetched from Supabase games table + storage
// Admin uploads custom logos which override default Lucide icons on game cards.
// Falls back to default SVG icons if no logo is set.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';

export type GameKey = 'crash' | 'mines' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'trading' | 'aviator';

type LogoEntry = { url: string; version: number };

class GameLogoStore {
  private logos: Record<string, LogoEntry> = {};

  constructor() {
    this.syncFromSupabase();
  }

  private async syncFromSupabase() {
    try {
      const { data } = await supabase.from('games').select('slug, icon_url');
      if (data) {
        for (const g of data) {
          if (g.icon_url) {
            this.logos[g.slug] = { url: g.icon_url, version: Date.now() };
          }
        }
        bus.emit(Topics.GameLogos, this.all());
      }
    } catch { /* use empty */ }
  }

  async get(key: GameKey): Promise<string | undefined> {
    // Try Supabase first
    try {
      const { data } = await supabase.from('games').select('icon_url').eq('slug', key).single();
      if (data?.icon_url) return data.icon_url;
    } catch {}
    return this.logos[key]?.url;
  }

  all(): Partial<Record<GameKey, string>> {
    const out: Partial<Record<GameKey, string>> = {};
    for (const [key, entry] of Object.entries(this.logos)) {
      out[key as GameKey] = entry.url;
    }
    return out;
  }

  async set(key: GameKey, iconUrl: string) {
    this.logos[key] = { url: iconUrl, version: Date.now() };
    // Update Supabase
    supabase.from('games').update({ icon_url: iconUrl }).eq('slug', key).then(() => {}).catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }

  async remove(key: GameKey) {
    delete this.logos[key];
    supabase.from('games').update({ icon_url: null }).eq('slug', key).then(() => {}).catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }
}

export const gameLogos = new GameLogoStore();
