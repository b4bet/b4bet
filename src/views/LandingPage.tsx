import { useState, useEffect, useRef } from 'react';
import { bus } from '../lib/bus';
import { auth } from '../lib/auth';

const GAMES = [
  { name: 'Aviator',    emoji: '✈️', desc: 'Fly high, cash out before crash!',          color: 'from-red-900/40 to-orange-900/40',   badge: 'TRENDING' },
  { name: 'Crash',      emoji: '🚀', desc: 'Multiplier climbs until it crashes.',        color: 'from-purple-900/40 to-indigo-900/40', badge: 'HOT' },
  { name: 'Mines',      emoji: '💣', desc: 'Navigate the minefield for rewards.',        color: 'from-amber-900/40 to-yellow-900/40',  badge: 'NEW' },
  { name: 'Trading',    emoji: '📈', desc: 'Trade crypto-style predictions.',            color: 'from-green-900/40 to-emerald-900/40', badge: '' },
  { name: 'Sun vs Moon',emoji: '☀️', desc: 'Classic dual-side betting.',                color: 'from-orange-900/40 to-amber-900/40',  badge: '' },
];

const FEATURES = [
  { icon: '🔒', title: 'Bank-Grade Security', desc: 'All transactions secured with end-to-end encryption. Your funds are always safe.' },
  { icon: '⚡', title: 'Instant Deposits', desc: 'Deposit via UPI, IMPS, NEFT instantly. Funds credited within seconds.' },
  { icon: '💸', title: 'Fast Withdrawals', desc: 'Withdraw to your UPI or bank. Most processed within 2 hours.' },
  { icon: '🎁', title: 'Welcome Bonus', desc: 'Get bonus on your first deposit. Plus daily bonuses and promotions.' },
  { icon: '📞', title: '24/7 Support', desc: 'Live chat support available around the clock. We\'re always here to help.' },
  { icon: '🏆', title: 'VIP Program', desc: 'Unlock exclusive rewards, higher limits and personal managers as you level up.' },
];

const STATS = [
  { value: '10L+', label: 'Happy Players' },
  { value: '₹50Cr+', label: 'Paid Out' },
  { value: '5', label: 'Live Games' },
  { value: '24/7', label: 'Support' },
];

interface Props { onNavigate: (r: string) => void; }

export default function LandingPage({ onNavigate }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [count, setCount] = useState({ players: 0, paid: 0 });
  const isLoggedIn = !!auth.getSession();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animated counters
  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const duration = 1800;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount({ players: Math.floor(ease * 1000000), paid: Math.floor(ease * 500000000) });
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const openAuth = (mode: 'login' | 'signup') => bus.emit('auth:open_modal', mode);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Sticky Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-md border-b border-white/10' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-neon-500 to-cyan-500 rounded-lg flex items-center justify-center font-black text-black text-sm">B4</div>
            <span className="font-black text-lg tracking-tight">B4BET</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#games" className="hover:text-white transition">Games</a>
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#affiliate" className="hover:text-white transition">Affiliate</a>
          </nav>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <button
                onClick={() => onNavigate('home')}
                className="px-4 py-2 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl text-sm transition">
                Play Now →
              </button>
            ) : (
              <>
                <button onClick={() => openAuth('login')}
                  className="px-4 py-2 text-slate-300 hover:text-white text-sm transition">Login</button>
                <button onClick={() => openAuth('signup')}
                  className="px-4 py-2 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl text-sm transition">
                  Join Free →
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-24 pb-16 px-4 text-center overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-neon-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-neon-300 font-semibold mb-6">
            🔥 India's Most Trusted Betting Platform
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-none mb-6">
            Win Big with{' '}
            <span className="bg-gradient-to-r from-neon-400 to-cyan-400 bg-clip-text text-transparent">B4BET</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Play Aviator, Crash, Mines and 2+ more exciting games. Instant UPI deposits, fast withdrawals, and huge bonuses.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <button
              onClick={() => openAuth('signup')}
              className="px-8 py-4 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-lg rounded-2xl hover:shadow-lg hover:shadow-neon-500/25 transition-all">
              Start Playing Free →
            </button>
            {isLoggedIn && (
              <button
                onClick={() => onNavigate('home')}
                className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition">
                Continue Playing
              </button>
            )}
          </div>
          {/* Live stats */}
          <div className="flex items-center justify-center gap-8 mt-10 flex-wrap">
            <div className="text-center">
              <div className="text-2xl font-black text-neon-400">{(count.players / 100000).toFixed(1)}L+</div>
              <div className="text-xs text-slate-500">Happy Players</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-neon-400">₹{Math.floor(count.paid / 10000000)}Cr+</div>
              <div className="text-xs text-slate-500">Paid Out</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-neon-400">5</div>
              <div className="text-xs text-slate-500">Live Games</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-neon-400">24/7</div>
              <div className="text-xs text-slate-500">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black mb-2">All Games</h2>
            <p className="text-slate-400">5 exciting games with provably fair results</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {GAMES.map(g => (
              <button
                key={g.name}
                onClick={() => isLoggedIn ? onNavigate(g.name.toLowerCase().replace(' vs ', 'vs').replace(' ', '')) : openAuth('signup')}
                className={`relative bg-gradient-to-br ${g.color} border border-white/10 rounded-2xl p-5 text-left hover:border-neon-500/40 hover:shadow-lg transition-all group`}>
                {g.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-black text-black bg-neon-400 rounded-full px-1.5 py-0.5">{g.badge}</span>
                )}
                <div className="text-3xl mb-3">{g.emoji}</div>
                <div className="font-bold text-white">{g.name}</div>
                <div className="text-xs text-slate-400 mt-1">{g.desc}</div>
                <div className="text-neon-400 text-xs font-semibold mt-3 group-hover:translate-x-1 transition-transform">Play Now →</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black mb-2">Why B4Bet?</h2>
            <p className="text-slate-400">Trusted by lakhs of players across India</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="text-3xl mb-3">{f.icon}</div>
                <div className="font-bold text-white mb-1">{f.title}</div>
                <div className="text-sm text-slate-400">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Affiliate CTA */}
      <section id="affiliate" className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-neon-900/40 to-cyan-900/20 border border-neon-500/20 rounded-3xl p-10">
            <div className="text-4xl mb-4">💰</div>
            <h2 className="text-3xl font-black mb-3">Earn With Our Affiliate Program</h2>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto">
              Earn up to ₹500 CPA per depositing player or{' '}
              <span className="text-neon-400 font-bold">10% RevShare</span> for lifetime. No cap, no limits.
            </p>
            <div className="flex items-center justify-center gap-8 mb-8 flex-wrap">
              <div className="text-center">
                <div className="text-2xl font-black text-neon-400">₹500</div>
                <div className="text-xs text-slate-500">CPA Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-neon-400">10%</div>
                <div className="text-xs text-slate-500">RevShare</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-neon-400">∞</div>
                <div className="text-xs text-slate-500">No Cap</div>
              </div>
            </div>
            <button
              onClick={() => onNavigate('affiliate')}
              className="px-8 py-4 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-lg rounded-2xl hover:shadow-lg hover:shadow-neon-500/25 transition-all">
              Join Affiliate Program →
            </button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-black mb-4">Ready to Win?</h2>
          <p className="text-slate-400 mb-8">Join thousands of players winning daily on B4Bet.</p>
          <button
            onClick={() => openAuth('signup')}
            className="px-10 py-5 bg-gradient-to-r from-neon-500 to-cyan-500 text-black font-black text-xl rounded-2xl hover:shadow-xl hover:shadow-neon-500/30 transition-all">
            Create Free Account →
          </button>
          <p className="text-xs text-slate-600 mt-4">No deposit required to register. 18+ only. Play responsibly.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-neon-500 to-cyan-500 rounded flex items-center justify-center font-black text-black text-xs">B4</div>
            <span className="font-bold">B4BET</span>
          </div>
          <p className="text-xs text-slate-600">© {new Date().getFullYear()} B4Bet. All rights reserved. 18+ only. Gamble responsibly.</p>
          <div className="flex gap-4 text-xs text-slate-600">
            <button onClick={() => onNavigate('home')} className="hover:text-white transition">Terms</button>
            <button onClick={() => onNavigate('home')} className="hover:text-white transition">Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
