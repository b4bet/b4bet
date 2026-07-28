import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Lock, X, Bell } from 'lucide-react';
import { cms } from '../lib/cms';
import { useTickets, useStaffSession, useStaff } from '../lib/cmsHooks';
import type { SupportTicket } from '../lib/cms';

interface Toast {
  id: string;
  ticketId: string;
  accountId: string;
  preview: string;
  kind: 'new-ticket' | 'new-message';
  ts: number;
}

export default function TicketAlertOverlay() {
  const tickets = useTickets();
  const sessionId = useStaffSession();
  const staff = useStaff();
  const me = sessionId ? staff.find((s) => s.id === sessionId) ?? null : null;
  const isSupport = !!me && (me.isOwner || me.permissions?.tickets === true || me.permissions?.intercom === true || me.role === 'support');

  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenCounts = useRef<Record<string, number>>({});
  const seenTickets = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!isSupport) return;

    const nextToasts: Toast[] = [];

    for (const t of tickets as SupportTicket[]) {
      const userMsgs = t.messages.filter((m) => m.role === 'user');
      const prevCount = seenCounts.current[t.id] ?? (initialized.current ? 0 : userMsgs.length);

      if (!initialized.current) {
        seenTickets.current.add(t.id);
      } else if (!seenTickets.current.has(t.id) && t.status === 'unassigned') {
        nextToasts.push({
          id: `${t.id}-new-${Date.now()}`,
          ticketId: t.id,
          accountId: t.accountId,
          preview: userMsgs.length ? userMsgs[userMsgs.length - 1].body.slice(0, 90) : 'New support ticket opened.',
          kind: 'new-ticket',
          ts: Date.now(),
        });
        seenTickets.current.add(t.id);
      } else if (userMsgs.length > prevCount) {
        const last = userMsgs[userMsgs.length - 1];
        nextToasts.push({
          id: `${t.id}-msg-${last.id}`,
          ticketId: t.id,
          accountId: t.accountId,
          preview: last.body.slice(0, 90) || '(attachment)',
          kind: 'new-message',
          ts: Date.now(),
        });
      }

      seenCounts.current[t.id] = userMsgs.length;
    }

    initialized.current = true;

    if (nextToasts.length > 0) {
      setToasts((prev) => [...prev, ...nextToasts].slice(-4));
    }
  }, [tickets, isSupport]);

  // Auto-dismiss after 8s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 8000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (!isSupport || toasts.length === 0) return null;

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const claim = (t: Toast) => {
    // Use assignTicket (the correct CMS method for claiming)
    if (sessionId && t.kind === 'new-ticket') cms.assignTicket(t.ticketId, sessionId);
    dismiss(t.id);
  };

  return (
    <div className="fixed bottom-4 left-4 z-[150] space-y-2 max-w-[280px]">
      {toasts.map((t) => (
        <div key={t.id} className="bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl overflow-hidden">
          <div className={`h-[2px] ${t.kind === 'new-ticket' ? 'bg-gradient-to-r from-neon-400 to-neon-600' : 'bg-gradient-to-r from-amberx-400 to-amberx-600'}`} />
          <div className="p-3 flex items-start gap-2">
            <div className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${t.kind === 'new-ticket' ? 'bg-neon-400/15 border border-neon-400/30' : 'bg-amberx-400/15 border border-amberx-400/30'}`}>
              {t.kind === 'new-ticket' ? <Bell className="w-3.5 h-3.5 text-neon-400" /> : <MessageSquare className="w-3.5 h-3.5 text-amberx-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">
                {t.kind === 'new-ticket' ? 'New support ticket' : 'New chat message'}
              </p>
              <p className="text-[10px] text-slate-500">#{t.accountId}</p>
              <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">{t.preview}</p>
              {t.kind === 'new-ticket' && sessionId && (
                <button
                  onClick={() => claim(t)}
                  className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-neon-500/20 border border-neon-500/40 text-neon-200 text-[10px] font-semibold hover:bg-neon-500/30"
                >
                  <Lock className="w-2.5 h-2.5" /> Claim
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
