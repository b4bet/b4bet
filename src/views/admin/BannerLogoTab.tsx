import { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, Trash2, Upload, Link as LinkIcon, Type, Globe, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cms } from '../../lib/cms';
import { supabase } from '@/integrations/supabase/client';
import { useBanners, useLogo, useTextLogo, useFavicon, readFileAsDataUrl } from '../../lib/cmsHooks';

// Logo/favicon are saved to the settings table with these keys
const LOGO_KEY = 'site_logo_data_url';
const TEXT_LOGO_KEY = 'site_text_logo_data_url';
const FAVICON_KEY = 'site_favicon_data_url';

async function saveSetting(key: string, value: string | null) {
  await supabase.rpc('admin_update_setting', { p_key: key, p_value: value }).catch(() => {});
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

  // Load logo/favicon from Supabase on mount
  useEffect(() => {
    loadLogoSettings();
  }, []);

  // Supabase realtime: banners table changes → useBanners() hook already reactive via cms.ts subscription
  // settings table changes → logo also reloads via cms_settings channel in cms.ts

  const onLogoPick = async (f: File | null) => {
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    cms.setLogo(dataUrl);
    await saveSetting(LOGO_KEY, dataUrl);
    setLogoSaved(true);
    cms.toast({ title: 'Website logo updated', body: 'Header logo replaced globally.', kind: 'success' });
    setTimeout(() => setLogoSaved(false), 3000);
  };

  const onTextLogoPick = async (f: File | null) => {
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    cms.setTextLogo(dataUrl);
    await saveSetting(TEXT_LOGO_KEY, dataUrl);
    cms.toast({ title: 'Text logo updated', body: 'Brand text image replaced.', kind: 'success' });
  };

  const onFaviconPick = async (f: File | null) => {
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    cms.setFavicon(dataUrl);
    await saveSetting(FAVICON_KEY, dataUrl);
    cms.toast({ title: 'Favicon updated', body: 'Browser tab icon refreshed.', kind: 'success' });
  };

  const onBannerPick = async (f: File | null) => {
    if (!f) return;
    cms.addBanner(await readFileAsDataUrl(f), newLink.trim());
    setNewLink('');
    cms.toast({ title: 'Banner added', body: 'Slider updated in Supabase.', kind: 'success' });
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
        <p className="text-slate-400 text-sm mb-4">Upload slider images with outbound links and replace the global website logo. All data saved to Supabase — realtime sync to all users.</p>

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
                <button onClick={() => logoInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                  <Upload className="w-3 h-3 inline mr-1" />Upload
                </button>
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
                <button onClick={() => textLogoInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                  <Upload className="w-3 h-3 inline mr-1" />Upload
                </button>
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
                <button onClick={() => faviconInput.current?.click()} className="btn-primary px-3 py-1.5 text-xs flex-1">
                  <Upload className="w-3 h-3 inline mr-1" />Upload
                </button>
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
            <button onClick={() => bannerInput.current?.click()} className="btn-primary px-3 py-2 text-sm whitespace-nowrap">
              <Upload className="w-4 h-4 inline mr-1" />Upload Slide
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
