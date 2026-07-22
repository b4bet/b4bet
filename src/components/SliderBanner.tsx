import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowRight, Sparkles, Trophy, Gift } from 'lucide-react';
import { useBanners } from '../lib/cmsHooks';

const promoSlides = [
  {
    title: 'Welcome Bonus',
    subtitle: 'Get up to ₹15,000 on your first deposit',
    cta: 'Claim Now',
    icon: Gift,
    gradient: 'from-neon-500/30 via-neon-600/10 to-transparent',
    accent: 'text-neon-300',
  },
  {
    title: 'Crash Champions',
    subtitle: 'Top multipliers win weekly leaderboard prizes',
    cta: 'Play Crash',
    icon: Trophy,
    gradient: 'from-emeraldwin-500/25 via-emeraldwin-600/10 to-transparent',
    accent: 'text-emeraldwin-400',
  },
  {
    title: 'Mines Mania',
    subtitle: 'Clear the grid for massive gem multipliers',
    cta: 'Play Mines',
    icon: Sparkles,
    gradient: 'from-coral-500/25 via-coral-600/10 to-transparent',
    accent: 'text-coral-400',
  },
];

export default function SliderBanner({ onCta }: { onCta: (i: number) => void }) {
  const banners = useBanners();
  const useAdmin = banners.length > 0;
  const count = useAdmin ? banners.length : promoSlides.length;
  const [idx, setIdx] = useState(0);

  const next = useCallback(() => setIdx((i) => (i + 1) % count), [count]);

  useEffect(() => {
    setIdx((i) => (i >= count ? 0 : i));
  }, [count]);

  useEffect(() => {
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [next]);

  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const handleTouchEnd = () => {
    if (touchStartX.current === null) return;
    const dx = touchDeltaX.current;
    if (Math.abs(dx) > 40) {
      setIdx((i) => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div
      className="relative w-full rounded-2xl bg-slatepanel-900"
      style={{ overflow: 'hidden' }}
    >
      {/* Slides track — each slide is exactly 100% width of this container */}
      <div
        className="flex h-40 sm:h-48 transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)`, width: '100%' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {useAdmin
          ? banners.map((b) => (
              <a
                key={b.id}
                href={b.linkUrl || '#'}
                onClick={(e) => { if (!b.linkUrl) e.preventDefault(); }}
                style={{ minWidth: '100%', maxWidth: '100%' }}
                className="relative block bg-slatepanel-900 flex-shrink-0"
              >
                <img
                  src={b.imageUrl}
                  alt={b.title || 'Banner'}
                  className="w-full h-full object-contain"
                />
              </a>
            ))
          : promoSlides.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  style={{ minWidth: '100%', maxWidth: '100%' }}
                  className="relative overflow-hidden flex-shrink-0"
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${s.gradient}`} />
                  <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
                  <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/3" />
                  <div className="relative h-full flex flex-col justify-center px-5 py-4">
                    <div className={`flex items-center gap-1.5 mb-2 ${s.accent}`}>
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Promo</span>
                    </div>
                    <h2 className="font-display font-extrabold text-white text-xl leading-tight mb-1">{s.title}</h2>
                    <p className="text-slate-300 text-xs leading-snug max-w-[70%]">{s.subtitle}</p>
                    <button onClick={() => onCta(i)} className="btn-primary mt-3 px-4 py-2 text-sm">
                      {s.cta} <ArrowRight className="inline w-3.5 h-3.5 ml-1" />
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-neon-400' : 'w-1.5 bg-slate-600'}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
