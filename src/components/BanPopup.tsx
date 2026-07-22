import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { auth } from '../lib/auth';
import { ShieldBan, Mail, LogOut } from 'lucide-react';

/**
 * Full-screen overlay shown to a logged-in user whose account has been banned.
 * Polls every 30 s so it appears without requiring a page refresh.
 */
export default function BanPopup() {
  const [banned, setBanned] = useState(false);
  const [supportEmail, setSupportEmail] = useState('support@b4bet.com');
  const [loggingOut, setLoggingOut] = useState(false);

  async function check() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBanned(false); return; }
      const { data } = await supabase.rpc('get_my_ban_status');
      if (data && data.length > 0) {
        setBanned(data[0].is_banned === true);
        if (data[0].support_email) setSupportEmail(data[0].support_email);
      }
    } catch {
      // silently ignore — don't block the app
    }
  }

  // Check on mount and every 30 s
  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try { await auth.logout(); } finally { setLoggingOut(false); }
  }

  if (!banned) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1a1a2e] border border-coral-500/40 rounded-2xl shadow-2xl p-6 space-y-5 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-coral-500/20 border-2 border-coral-500/40 flex items-center justify-center mx-auto">
          <ShieldBan className="w-8 h-8 text-coral-400" />
        </div>

        {/* Heading */}
        <div>
          <h2 className="font-display font-bold text-xl text-white">Account Suspended</h2>
          <p className="text-sm text-slate-400 mt-1">
            Your account has been banned. You can no longer access this platform.
          </p>
        </div>

        {/* Support email */}
        <a
          href={`mailto:${supportEmail}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-neon-500/15 border border-neon-500/30 text-neon-300 text-sm font-semibold hover:bg-neon-500/25 transition-colors"
        >
          <Mail className="w-4 h-4" />
          Contact Support: {supportEmail}
        </a>

        {/* Logout */}
        <button
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-coral-500/20 border border-coral-500/40 text-coral-300 text-sm font-semibold hover:bg-coral-500/30 transition-colors disabled:opacity-60"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    </div>
  );
}
