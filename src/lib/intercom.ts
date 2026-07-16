// Internal intercom chat — admin supervisor team communication.
import { bus, Topics } from './bus';

export interface IntercomMessage {
  id: string;
  author: string;
  role: string;
  body: string;
  ts: number;
}

class Intercom {
  messages: IntercomMessage[] = [
    { id: 'm1', author: 'Supervisor-01', role: 'Ops', body: 'Shift handover complete. Monitoring Crash rounds.', ts: Date.now() - 60000 },
    { id: 'm2', author: 'Supervisor-02', role: 'Risk', body: 'Auto-shield holding at 55% win prob. Revenue on target.', ts: Date.now() - 30000 },
  ];

  send(author: string, role: string, body: string) {
    if (!body.trim()) return;
    const msg: IntercomMessage = {
      id: Math.random().toString(36).slice(2),
      author,
      role,
      body: body.trim(),
      ts: Date.now(),
    };
    this.messages = [...this.messages, msg].slice(-100);
    bus.emit(Topics.Intercom, this.messages);
  }

  list(): IntercomMessage[] {
    return this.messages;
  }
}

export const intercom = new Intercom();
