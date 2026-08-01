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
      className="relative w-full overflow-hidden rounded-xl select-none bg-black"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides track */}
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {useAdmin
          ? banners.map((b) => (
              <a
                key={b.id}
                href={b.linkUrl || '#'}
                onClick={(e) => { if (!b.linkUrl) e.preventDefault(); }}
                style={{ minWidth: '100%', maxWidth: '100%' }}
                className="flex-shrink-0 block bg-black"
              >
                {/* width:100% height:auto — image shows fully, no crop ever */}
                <img
                  src={b.imageUrl}
                  alt={b.title || 'Banner'}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </a>
            ))
          : promoSlides.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  style={{ minWidth: '100%', maxWidth: '100%' }}
                  className="relative flex-shrink-0 aspect-[2/1] bg-gradient-to-r from-slatepanel-800 to-slatepanel-900 overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${s.gradient}`} />
                  <div className="relative z-10 flex flex-col justify-center h-full px-5 py-4">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-1 ${s.accent}`}>
                      <Icon className="w-3.5 h-3.5" />
                      <span>Promo</span>
                    </div>
                    <h3 className="text-white font-bold text-lg leading-tight">{s.title}</h3>
                    <p className="text-slate-300 text-sm mt-0.5">{s.subtitle}</p>
                    <button onClick={() => onCta(i)} className="btn-primary mt-3 px-4 py-2 text-sm">
                      {s.cta} <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
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
