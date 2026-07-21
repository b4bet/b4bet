import { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, Trash2, Upload, Link as LinkIcon, Type, Globe, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { cms } from '../../lib/cms';
import { supabase } from '@/integrations/supabase/client';
import { useBanners, useLogo, useTextLogo, useFavicon } from '../../lib/cmsHooks';

// Settings keys
const LOGO_KEY = 'site_logo_data_url';
const TEXT_LOGO_KEY = 'site_text_logo_data_url';
const FAVICON_KEY = 'site_favicon_data_url';

/** Upload a File to Supabase Storage and return its public URL */
async function uploadToStorage(bucket: string, file: File, pathPrefix: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${pathPrefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Save URL to settings table */
async function saveSetting(key: string, value: string | null) {
  const { error } = await supabase.rpc('admin_update_setting', {
    p_key: key,
    p_value: value as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(error.message);
}

async function loadLogoSettings() {
  const { data } = await supabase.rpc('admin_get_settings');
  if (!data) return;
  const rows = data as Array<{ key: string; value: unknown }>;
  const find = (k: string) => (rows.find(r => r.key === k)?.value as string) || null;
  const logo = find(LOGO_KEY);
  const textLogo = find(TEXT_LOGO_KEY);
  const favicon = find(FAVICON_KEY);
  if (logo) cms.setLogo(logo);
  if (textLogo) cms.setTextLogo(textLogo);
  if (favicon) cms.setFavicon(favicon);
}

export default function BannerLogoTab() {
  const banners = useBanners();
  const logo = useLogo();
  const textLogo = useTextLogo();
  const favicon = useFavicon();
  const logoInput = useRef<HTMLInputElement>(null);
  const textLogoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [newLink, setNewLink] = useState('');
  const [logoSaved, setLogoSaved] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // which slot is uploading

  useEffect(() => { loadLogoSettings(); }, []);

  const onLogoPick = async (f: File | null) => {
    if (!f) return;
    setUploading('logo');
    try {
      const url = await uploadToStorage('logos', f, 'icon-logo');
      cms.setLogo(url);
      await saveSetting(LOGO_KEY, url);
      setLogoSaved(true);
      cms.toast({ title: 'Website logo updated', body: 'Header logo replaced globally.', kind: 'success' });
      setTimeout(() => setLogoSaved(false), 3000);
    } catch (e) {
      cms.toast({ title: 'Upload failed', body: (e as Error).message, kind: 'alert' });
    } finally { setUploading(null); }
  };

  const onTextLogoPick = async (f: File | null) => {
    if (!f) return;
    setUploading('textLogo');
    try {
      const url = await uploadToStorage('logos', f, 'text-logo');
      cms.setTextLogo(url);
      await saveSetting(TEXT_LOGO_KEY, url);
      cms.toast({ title: 'Text logo updated', body: 'Brand text image replaced.', kind: 'success' });
    } catch (e) {
      cms.toast({ title: 'Upload failed', body: (e as Error).message, kind: 'alert' });
    } finally { setUploading(null); }
  };

  const onFaviconPick = async (f: File | null) => {
    if (!f) return;
    setUploading('favicon');
    try {
      const url = await uploadToStorage('logos', f, 'favicon');
      cms.setFavicon(url);
      await saveSetting(FAVICON_KEY, url);
      cms.toast({ title: 'Favicon updated', body: 'Browser tab icon refreshed.', kind: 'success' });
    } catch (e) {
      cms.toast({ title: 'Upload failed', body: (e as Error).message, kind: 'alert' });
    } finally { setUploading(null); }
  };

  const onBannerPick = async (f: File | null) => {
    if (!f) return;
    setUploading('banner');
    try {
      const url = await uploadToStorage('banners', f, 'slide');
      cms.addBanner(url, newLink.trim());
      setNewLink('');
      cms.toast({ title: 'Banner added', body: 'Slider updated in Supabase.', kind: 'success' });
    } catch (e) {
      cms.toast({ title: 'Banner upload failed', body: (e as Error).message, kind: 'alert' });
    } finally { setUploading(null); }
  };

  const handleRemoveLogo = async () => {
    cms.setLogo(null);
    await saveSetting(LOGO_KEY, null);
  };

  const handleRemoveTextLogo = async () => {
    cms.setTextLogo(null);
    await saveSetting(TEXT_LOGO_KEY, null);
  };

  const handleRemoveFavicon = async () => {
    cms.setFavicon(null);
    await saveSetting(FAVICON_KEY, null);
  };

  const UploadBtn = ({ slot, onClick }: { slot: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={uploading === slot}
      className="btn-primary px-3 py-1.5 text-xs flex-1 flex items-center justify-center gap-1 disabled:opacity-60"
    >
      {uploading === slot
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
        : <><Upload className="w-3 h-3" /> Upload</>}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-neonblue-400" />
          <h2 className="font-bold text-white text-lg">Banner Slider & Logo Manager</h2>
          {logoSaved && (
            <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3 h-3" /> Saved to Supabase
            </span>
          )}
        </div>
        <p className="text-slate-400 text-sm mb-4">Upload slider images with outbound links and replace the global website logo. Files are stored in Supabase Storage — realtime sync to all users.</p>

        {/* Logo manager */}
        <div className="panel p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Type className="w-4 h-4 text-neonpurple-400" />
            <h3 className="font-semibold text-white">Website Logo</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Icon logo */}
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Icon Logo</p>
              <div className="w-full h-16 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                {logo ? <img src={logo} alt="logo" className="h-full object-contain" /> : <span className="text-slate-500 text-xs">No logo</span>}
              </div>
              <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={e => onLogoPick(e.target.files?.[0] ?? null)} />
              <div className="flex gap-2">
                <UploadBtn slot="logo" onClick={() => logoInput.current?.click()} />
                {logo && (
                  <button onClick={handleRemoveLogo} className="btn-ghost px-2 py-1.5 text-xs">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Text logo */}
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Text Logo (image)</p>
              <div className="w-full h-16 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                {textLogo ? <img src={textLogo} alt="text-logo" className="h-full object-contain" /> : <span className="text-slate-500 text-xs">No text logo</span>}
              </div>
              <input ref={textLogoInput} type="file" accept="image/*" className="hidden" onChange={e => onTextLogoPick(e.target.files?.[0] ?? null)} />
              <div className="flex gap-2">
                <UploadBtn slot="textLogo" onClick={() => textLogoInput.current?.click()} />
                {textLogo && (
                  <button onClick={handleRemoveTextLogo} className="btn-ghost px-2 py-1.5 text-xs">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Favicon</p>
              <div className="w-full h-16 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                {favicon ? <img src={favicon} alt="favicon" className="h-full object-contain" /> : <span className="text-slate-500 text-xs">Default</span>}
              </div>
              <input ref={faviconInput} type="file" accept="image/*" className="hidden" onChange={e => onFaviconPick(e.target.files?.[0] ?? null)} />
              <div className="flex gap-2">
                <UploadBtn slot="favicon" onClick={() => faviconInput.current?.click()} />
                {favicon && (
                  <button onClick={handleRemoveFavicon} className="btn-ghost px-2 py-1.5 text-xs">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Banner manager */}
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-neonblue-400" />
            <h3 className="font-semibold text-white">Slider Banners</h3>
            <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Realtime synced
            </span>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={newLink}
                onChange={e => setNewLink(e.target.value)}
                placeholder="Destination URL (e.g. https://...)"
                className="input pl-9 w-full"
              />
            </div>
            <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={e => onBannerPick(e.target.files?.[0] ?? null)} />
            <button
              onClick={() => bannerInput.current?.click()}
              disabled={uploading === 'banner'}
              className="btn-primary px-3 py-2 text-sm whitespace-nowrap flex items-center gap-1 disabled:opacity-60"
            >
              {uploading === 'banner'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                : <><Upload className="w-4 h-4" /> Upload Slide</>}
            </button>
          </div>

          <div className="space-y-2">
            {banners.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No banners yet.</p>}
            {banners.map((b) => (
              <div key={b.id} className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-2">
                <img src={b.imageDataUrl || b.imageUrl} alt="slide" className="w-20 h-12 object-cover rounded" />
                <input
                  defaultValue={b.linkUrl}
                  onBlur={e => cms.updateBanner(b.id, { linkUrl: e.target.value })}
                  placeholder="https://..."
                  className="input text-xs py-1.5 flex-1"
                />
                <span className="text-slate-400 text-xs hidden sm:block truncate max-w-[120px]">{b.linkUrl || '(no link)'}</span>
                <button onClick={() => cms.removeBanner(b.id)} className="text-coral-400 hover:text-coral-300 text-xs flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
