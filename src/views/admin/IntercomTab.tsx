import { useState, useEffect, useRef } from 'react';
import { intercom } from '../../lib/intercom';
import { useBus } from '../../lib/hooks';
import { Topics } from '../../lib/bus';
import type { IntercomMessage } from '../../lib/intercom';
import { Send, Radio, Headphones } from 'lucide-react';

export default function IntercomTab() {
  const messages = useBus<IntercomMessage[]>(Topics.Intercom, intercom.list());
  const [body, setBody] = useState('');
  const [author] = useState('Admin-You');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!body.trim()) return;
    intercom.send(author, 'Supervisor', body);
    setBody('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Internal Intercom Chat</h2>
          <p className="text-xs text-slate-500">Live synchronized team communication.</p>
        </div>
        <span className="chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-xs">
          <Radio className="w-3.5 h-3.5" /> <span className="w-1.5 h-1.5 rounded-full bg-emeraldwin-500 animate-ticker-blink" /> Connected
        </span>
      </div>

      <div className="panel flex flex-col h-[60vh]">
        {/* Terminal log */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-midnight-950/50">
          {messages.map((m) => (
            <div key={m.id} className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center flex-shrink-0">
                <Headphones className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neon-300">{m.author}</span>
                  <span className="chip bg-slatepanel-800 border border-borderline-900 text-slate-400 text-[9px]">{m.role}</span>
                  <span className="text-[10px] text-slate-600 tabular">{new Date(m.ts).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-slate-200 mt-0.5 break-words">{m.body}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-borderline-900 p-3 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message to the team…"
            className="input flex-1"
          />
          <button onClick={send} className="btn-primary px-4"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}
