import fs from 'node:fs';
import path from 'node:path';
import { setEventSinkFactory } from './EventLog';

/** Grava cada partida em server/logs/<sala>-<data>.jsonl (desative com EVENT_LOG_TO_FILE=false). */
export function enableFileEventLog() {
  if ((process.env.EVENT_LOG_TO_FILE ?? 'true') === 'false') return;
  setEventSinkFactory((code, startedAt) => {
    try {
      const dir = path.resolve(process.cwd(), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `${code}-${stamp}.jsonl`);
      return (line) => fs.appendFile(file, line + '\n', () => {});
    } catch {
      return null;
    }
  });
}
