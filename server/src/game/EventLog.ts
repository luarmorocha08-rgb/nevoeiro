import fs from 'node:fs';
import path from 'node:path';
import type { ServerPlayer } from './types';

export interface LoggedEvent {
  /** ms desde o início da partida */
  t: number;
  iso: string;
  type: string;
  [k: string]: unknown;
}

const LOG_TO_FILE = (process.env.EVENT_LOG_TO_FILE ?? 'true') !== 'false';

function who(p: ServerPlayer) {
  return { netId: p.netId, name: p.name, role: p.role.id, bot: p.isBot };
}

/**
 * Log de eventos do servidor: quem matou quem, quando, onde, com qual papel.
 * Vai para o console e (opcionalmente) para server/logs/<sala>-<data>.jsonl
 */
export class EventLog {
  readonly events: LoggedEvent[] = [];
  private file: string | null = null;

  constructor(
    private readonly roomCode: string,
    private readonly startedAt: number,
  ) {
    if (LOG_TO_FILE) {
      try {
        const dir = path.resolve(process.cwd(), 'logs');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
        this.file = path.join(dir, `${roomCode}-${stamp}.jsonl`);
      } catch {
        this.file = null;
      }
    }
  }

  add(type: string, data: Record<string, unknown>, now = Date.now()): LoggedEvent {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      clean[k] = v && typeof v === 'object' && 'netId' in (v as object) && 'role' in (v as object)
        ? who(v as ServerPlayer)
        : v;
    }
    const ev: LoggedEvent = { t: now - this.startedAt, iso: new Date(now).toISOString(), type, ...clean };
    this.events.push(ev);
    const line = JSON.stringify(ev);
    if (process.env.NODE_ENV !== 'test') console.log(`[sala ${this.roomCode}] ${line}`);
    if (this.file) fs.appendFile(this.file, line + '\n', () => {});
    return ev;
  }
}
