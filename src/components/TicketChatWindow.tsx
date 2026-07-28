import { useEffect, useRef, useState } from 'react';
import { Minus, X, Trash2, Send, FileText, Headphones } from 'lucide-react';
import { cms } from '../lib/cms';
import { useTickets } from '../lib/cmsHooks';

interface Props {
  ticketId: string;
  staffId: string;
  onClose: () => void;
}

export default function TicketChatWindow({ ticketId, staffId, onClose }: Props) {
  const tickets = useTickets();
  const ticket = tickets.find((t) => t.id === ticketId) ?? null;
  const [minimized, setMinimized] = useState(false);
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.messages.length]);

  if (!ticket) return null;

  const send = () => {
    if (!body.trim()) return;
    // Use addTicketMessage as agent reply
    cms.addTicketMessage(ticketId, body.trim(), 'agent', staffId);
    setBody('');
  };

  const endTicket = () => {
    if (confirm('End and delete this ticket permanently?')) {
      cms.closeTicket(ticketId);
      onClose();
    }
  };

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[130] panel border border-neon-400/40 bg-midnight-900/95 px-3 py-2 flex items-center gap-2 shadow-2xl"
      >
        <Headphones className="w-4 h-4 text-neon-400" />
        <span className="text-sm font-semibold text-white">Ticket #{ticket.accountId}</span>
        {ticket.messages.length > 0 && (
          <span className="chip bg-neon-500/20 text-neon-300 text-[10px]">{ticket.messages.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[130] w-80 flex flex-col bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-midnight-900 border-b border-borderline-900">
        <Headphones className="w-4 h-4 text-neon-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">Ticket #{ticket.accountId}</p>
          <p className="text-[10px] text-slate-500">Locked under your account</p>
        </div>
        <button onClick={() => setMinimized(true)} title="Minimize" className="w-7 h-7 grid place-items-center rounded hover:bg-slatepanel-800 text-slate-400">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button onClick={endTicket} title="End ticket" className="w-7 h-7 grid place-items-center rounded hover:bg-slatepanel-800 text-coral-400">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} title="Close window" className="w-7 h-7 grid place-items-center rounded hover:bg-slatepanel-800 text-slate-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 h-60 overflow-y-auto scrollbar-thin px-3 py-2 space-y-2">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.role === 'agent' ? 'bg-neon-500/20 border border-neon-500/30 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-100'}`}>
              {m.role === 'agent' && <p className="text-[9px] font-bold text-neon-300 mb-0.5 uppercase tracking-wider">You</p>}
              {m.body && <p className="text-xs whitespace-pre-wrap break-words">{m.body}</p>}
              {m.attachments?.map((a, i) => a.kind === 'image' ? (
                <img key={i} src={a.dataUrl} alt={a.name} className="rounded-lg max-h-32 object-cover mt-1" />
              ) : (
                <a key={i} href={a.dataUrl} target="_blank" rel="noreferrer"
                   className="flex items-center gap-1 text-[10px] text-slate-300 mt-1">
                  <FileText className="w-3 h-3" />{a.name}
                </a>
              ))}
              <p className="text-[9px] opacity-50 mt-0.5">{new Date(m.ts).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-borderline-900 bg-midnight-900">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a reply…"
          className="input flex-1 text-sm py-2"
        />
        <button onClick={send} className="btn-primary h-9 px-3">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
