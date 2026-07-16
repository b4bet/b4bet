import { useEffect, useRef, useState } from 'react';
import { Minus, X, Trash2, Send, FileText, Headphones } from 'lucide-react';
import { cms } from '../lib/cms';
import { useTickets } from '../lib/cmsHooks';

interface Props {
  ticketId: string;
  staffId: string;
  onClose: () => void;          // Exit — keeps session
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
    if (cms.postTicketReply(ticketId, staffId, body.trim())) setBody('');
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
        <Headphones className="w-4 h-4 text-neon-300" />
        <span className="text-xs text-white">Ticket #{ticket.accountId}</span>
        {ticket.messages.length > 0 && (
          <span className="chip bg-coral-500/20 text-coral-300 text-[10px]">{ticket.messages.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[130] w-[min(380px,calc(100vw-2rem))] panel border border-neon-400/40 bg-midnight-900/95 backdrop-blur-xl shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-borderline-900">
        <div className="flex items-center gap-2 min-w-0">
          <Headphones className="w-4 h-4 text-neon-300 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-white font-semibold truncate">Ticket #{ticket.accountId}</div>
            <div className="text-[10px] text-slate-500">Locked under your account</div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setMinimized(true)} title="Minimize" className="w-7 h-7 grid place-items-center rounded hover:bg-slatepanel-800 text-slate-400">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Exit (keep session)" className="w-7 h-7 grid place-items-center rounded hover:bg-slatepanel-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
          <button onClick={endTicket} title="Close & End Ticket" className="w-7 h-7 grid place-items-center rounded hover:bg-coral-500/20 text-coral-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 h-80 overflow-auto p-3 space-y-2 scrollbar-thin">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.role === 'agent' ? 'bg-neon-500/20 text-white' : 'bg-slatepanel-800 text-slate-200'}`}>
              {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
              {m.attachments?.map((a, i) => a.kind === 'image' ? (
                <img key={i} src={a.dataUrl} alt={a.name} className="rounded mt-1 max-h-32 object-cover" />
              ) : (
                <a key={i} href={a.dataUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs mt-1 underline">
                  <FileText className="w-3 h-3" /> {a.name}
                </a>
              ))}
              <p className="text-[9px] opacity-60 mt-0.5">{new Date(m.ts).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-2 border-t border-borderline-900 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a reply…"
          className="input flex-1 text-sm py-2"
        />
        <button onClick={send} className="btn-primary px-3 py-2"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
