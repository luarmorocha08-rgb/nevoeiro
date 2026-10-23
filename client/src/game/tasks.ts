/**
 * Tarefas no cliente: abrir o minijogo perto da estação, concluir e cancelar.
 * O servidor valida distância, tempo mínimo e se a tarefa é sua.
 */
import { CONFIG, taskStation } from '@nevoeiro/shared';
import { sfx } from '../audio/sfx';
import { sendTask } from '../net/connection';
import { net } from '../net/netState';
import { getState } from '../net/store';

let openedAt = 0;

/** Tarefa pendente mais próxima dentro do alcance (ou null). */
export function nearestTask(): string | null {
  const st = getState();
  if (!st.tasks || !st.you?.alive || st.phase !== 'playing' || st.end) return null;
  let best: string | null = null;
  let bestD = CONFIG.tasks.radius - 0.15;
  for (const t of st.tasks.list) {
    if (t.done) continue;
    const s = taskStation(t.id);
    if (!s) continue;
    const d = Math.hypot(s.x - net.local.x, s.z - net.local.z);
    if (d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

export function openTask() {
  const st = getState();
  const id = st.taskNear;
  if (!id || st.taskOpen || !st.you?.alive || st.you.frozen > 0) return;
  openedAt = performance.now();
  // abre antes de enviar: se o servidor recusar, a resposta (sem tarefa ativa) fecha o minijogo
  st.set({ taskOpen: id, chatOpen: false, mapOpen: false });
  sendTask('start', id);
  sfx.play('click');
  document.exitPointerLock?.();
}

/** Minijogo vencido: espera o tempo mínimo da estação e avisa o servidor. */
export function finishTask(): Promise<void> {
  const st = getState();
  const id = st.taskOpen;
  if (!id) return Promise.resolve();
  const station = taskStation(id);
  const minMs = (station?.seconds ?? 0) * 1000 + 150;
  const wait = Math.max(0, openedAt + minMs - performance.now());
  return new Promise((resolve) =>
    setTimeout(() => {
      if (getState().taskOpen === id) {
        sendTask('finish', id);
        getState().set({ taskOpen: null });
      }
      resolve();
    }, wait),
  );
}

/** Tempo que ainda falta para o servidor aceitar (ms). */
export function taskMinRemaining(): number {
  const id = getState().taskOpen;
  const station = id ? taskStation(id) : undefined;
  if (!station) return 0;
  return Math.max(0, openedAt + station.seconds * 1000 + 150 - performance.now());
}

export function cancelTask() {
  const st = getState();
  if (!st.taskOpen) return;
  sendTask('cancel', st.taskOpen);
  st.set({ taskOpen: null });
}
