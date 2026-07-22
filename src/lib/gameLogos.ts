// Game logos — fetched from Supabase games table + storage
// Admin uploads custom logos which override default Lucide icons on game cards.
// Falls back to base64 data URL if Supabase Storage upload fails.

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

  all(): Partial<Record<GameKey, string>> {
    const out: Partial<Record<GameKey, string>> = {};
    for (const [key, entry] of Object.entries(this.logos)) {
      out[key as GameKey] = entry.url;
    }
    return out;
  }

  /**
   * Upload file to Supabase Storage bucket "game-logos" and save the public URL.
   * Falls back to base64 data URL if storage upload fails.
   * Returns the final URL used (storage URL or base64), or null on complete failure.
   */
  async uploadAndSet(key: GameKey, file: File): Promise<string | null> {
    // Try Supabase Storage first
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${key}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('game-logos')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (!storageError) {
        const { data: urlData } = supabase.storage.from('game-logos').getPublicUrl(path);
        const publicUrl = urlData?.publicUrl;
        if (publicUrl) {
          await this.set(key, publicUrl);
          return publicUrl;
        }
      }
    } catch {
      // fall through to base64
    }

    // Fallback: base64 data URL
    return new Promise<string | null>((resolve) => {
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

  /** Save a URL string directly to local store + Supabase games table */
  async set(key: GameKey, iconUrl: string) {
    this.logos[key] = { url: iconUrl, version: Date.now() };
    // Fire-and-forget Supabase update
    supabase
      .from('games')
      .update({ icon_url: iconUrl })
      .eq('slug', key)
      .then(() => {})
      .catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }

  async remove(key: GameKey) {
    delete this.logos[key];
    supabase
      .from('games')
      .update({ icon_url: null })
      .eq('slug', key)
      .then(() => {})
      .catch(() => {});
    bus.emit(Topics.GameLogos, this.all());
  }
}

export const gameLogos = new GameLogoStore();
