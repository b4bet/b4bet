import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle, GripVertical } from 'lucide-react';
import { cms } from '../lib/cms';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import { useStaffSession } from '../lib/cmsHooks';
import type { SupportTicket } from '../lib/cms';

export default function AdminSupportNotification() {
  const staffSession = useStaffSession();
  const tickets = useBus<SupportTicket[]>(Topics.Tickets, cms.tickets);
  const [visible, setVisible] = useState<SupportTicket | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 280, y: 16 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[200] w-[248px] bg-slatepanel-900 border border-borderline-900 rounded-xl shadow-2xl overflow-hidden select-none"
    >
      {/* Top accent bar */}
      <div className="h-[2px] bg-gradient-to-r from-neon-400 to-neon-600" />

      {/* Drag handle + header row */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center gap-1.5 px-2 pt-2 pb-1 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
        <div className="w-6 h-6 rounded-lg bg-neon-400/15 border border-neon-400/30 grid place-items-center flex-shrink-0">
          <AlertCircle className="w-3 h-3 text-neon-400" />
        </div>
        <p className="text-xs font-bold text-white flex-1 leading-none">New Ticket</p>
        <span className="text-[10px] text-slate-500 tabular-nums">{timeLeft}s</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setVisible(null)}
          className="w-5 h-5 rounded-md hover:bg-slatepanel-800 grid place-items-center flex-shrink-0"
        >
          <X className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* Message preview */}
      <p className="mx-2 mb-2 text-[11px] text-slate-300 bg-slatepanel-800 rounded-lg px-2 py-1.5 line-clamp-2">
        {visible.messages?.[0]?.body || 'Support message'}
      </p>

      {/* Accept / Reject buttons */}
      <div className="flex gap-1.5 px-2 pb-2">
        <button
          onClick={() => {
            if (staffSession) cms.assignTicket(visible.id, staffSession);
            setVisible(null);
          }}
          className="flex-1 btn-emerald py-1 px-2 text-[11px] font-semibold flex items-center justify-center gap-1"
        >
          <CheckCircle2 className="w-3 h-3" /> Accept
        </button>
        <button
          onClick={() => {
            cms.closeTicket(visible.id);
            setVisible(null);
          }}
          className="flex-1 btn-coral py-1 px-2 text-[11px] font-semibold flex items-center justify-center gap-1"
        >
          <XCircle className="w-3 h-3" /> Reject
        </button>
      </div>
    </div>
  );
}
