import type { ServerPlayer } from './types';

export interface LoggedEvent {
  /** ms desde o início da partida */
  t: number;
  iso: string;
  type: string;
  [k: string]: unknown;
}

/** Destino extra das linhas do log (o servidor grava em arquivo; no navegador não há). */
type SinkFactory = (roomCode: string, startedAt: number) => ((line: string) => void) | null;
let sinkFactory: SinkFactory | null = null;
export function setEventSinkFactory(f: SinkFactory | null) {
  sinkFactory = f;
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

function who(p: ServerPlayer) {
  return { netId: p.netId, name: p.name, role: p.role.id, bot: p.isBot };
}

/**
 * Log de eventos da partida: quem matou quem, quando, onde, com qual papel.
 * Vai para o console e (no servidor) para server/logs/<sala>-<data>.jsonl
 */
export class EventLog {
  readonly events: LoggedEvent[] = [];
  private sink: ((line: string) => void) | null;

  constructor(
    private readonly roomCode: string,
    private readonly startedAt: number,
  ) {
    this.sink = sinkFactory?.(roomCode, startedAt) ?? null;
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
    if (env.NODE_ENV !== 'test' && env.NEVOEIRO_QUIET !== '1' && 'process' in globalThis) console.log(`[sala ${this.roomCode}] ${line}`);
    this.sink?.(line);
    return ev;
  }
}
