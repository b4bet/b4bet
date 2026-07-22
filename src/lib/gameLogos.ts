// Game logos — fetched from Supabase games table + storage
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

  /**
   * Upload file to Supabase Storage bucket "game-logos" and save the public URL
   * to the games table. Falls back to base64 data URL if storage upload fails
   * (e.g. bucket does not exist yet).
   */
  async uploadAndSet(key: GameKey, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${key}-${Date.now()}.${ext}`;

    // Try Supabase Storage first
    const { data: storageData, error: storageError } = await supabase.storage
      .from('game-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (!storageError && storageData) {
      const { data: urlData } = supabase.storage.from('game-logos').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;
      if (publicUrl) {
        await this.set(key, publicUrl);
        return publicUrl;
      }
    }

    // Fallback: read as base64 data URL and store directly
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await this.set(key, dataUrl);
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async set(key: GameKey, iconUrl: string) {
    this.logos[key] = { url: iconUrl, version: Date.now() };
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
