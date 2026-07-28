import { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cms } from '../lib/cms';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import { useStaffSession } from '../lib/cmsHooks';
import type { SupportTicket } from '../lib/cms';

export default function AdminSupportNotification() {
  const staffSession = useStaffSession();
  const tickets = useBus<SupportTicket[]>(Topics.Tickets, cms.tickets);
  const [visible, setVisible] = useState<SupportTicket | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    const unassigned = tickets.find(t => t.status === 'unassigned' && !t.acknowledged);
    if (unassigned && !visible) {
      setVisible(unassigned);
      setTimeLeft(60);
    }
  }, [tickets, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setVisible(null); return 60; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] w-80 bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-neon-400 to-neon-600" />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neon-400/15 border border-neon-400/30 grid place-items-center">
              <AlertCircle className="w-4 h-4 text-neon-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">New Support Ticket</p>
              <p className="text-[10px] text-slate-500">From user</p>
            </div>
          </div>
          <button onClick={() => setVisible(null)} className="w-6 h-6 rounded-lg hover:bg-slatepanel-800 grid place-items-center flex-shrink-0">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        <p className="text-xs text-slate-300 bg-slatepanel-800 rounded-lg px-3 py-2">
          {visible.messages?.[0]?.body || 'Support message'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => {
              // Use assignTicket (the correct claim method)
              if (staffSession) cms.assignTicket(visible.id, staffSession);
              setVisible(null);
            }}
            className="flex-1 btn-emerald py-2 px-2 text-xs font-semibold flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
          </button>
          <button
            onClick={() => {
              cms.closeTicket(visible.id);
              setVisible(null);
            }}
            className="flex-1 btn-coral py-2 px-2 text-xs font-semibold flex items-center justify-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
        </div>

        <p className="text-[10px] text-slate-600 text-center">Auto-dismiss in {timeLeft}s</p>
      </div>
    </div>
  );
}
