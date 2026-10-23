/**
 * Feedback de toda ação: som, vibração (celular) e texto curto na tela.
 * O servidor confirma cada ação bem-sucedida com S2C.ack; erros chegam como toast.
 */
import type { AckMsg, ActionType } from '@nevoeiro/shared';
import { sfx, type SfxName } from '../audio/sfx';
import { getState } from '../net/store';

const SOUND: Record<ActionType, SfxName> = {
  kill: 'kill',
  morph: 'morph',
  invisible: 'vanish',
  teleport: 'teleport',
  shoot: 'shot',
  examine: 'examine',
  cuff: 'cuff',
  revive: 'revive',
  thermal: 'thermal',
};

const VIBRATION: Partial<Record<ActionType, number | number[]>> = {
  kill: [40, 30, 60],
  shoot: [70],
  cuff: [30, 40, 30],
  revive: [20, 40, 80],
};

export function vibrate(pattern: number | number[]) {
  try {
    if (getState().settings.vibration) navigator.vibrate?.(pattern);
  } catch {
    /* sem suporte */
  }
}

export function onActionAck(m: AckMsg) {
  sfx.play(SOUND[m.action] ?? 'click');
  vibrate(VIBRATION[m.action] ?? 15);
  getState().set({ feedback: { text: m.text, action: m.action, at: Date.now() } });
}

/** Erro: som curto + vibração dupla. */
export function onActionDenied() {
  sfx.play('deny');
  vibrate([12, 40, 12]);
}

let lastCd: Record<string, number> = {};
/** Toca um aviso quando uma habilidade sai da recarga. Chamado a cada snapshot. */
export function watchCooldowns(abilities: { action: string; cd: number }[]) {
  for (const a of abilities) {
    const prev = lastCd[a.action];
    if (prev !== undefined && prev > 0 && a.cd <= 0) {
      sfx.play('ready');
      vibrate(25);
      getState().set({ readyFlash: { action: a.action, at: Date.now() } });
    }
  }
  lastCd = Object.fromEntries(abilities.map((a) => [a.action, a.cd]));
}

export function resetCooldownWatch() {
  lastCd = {};
}
