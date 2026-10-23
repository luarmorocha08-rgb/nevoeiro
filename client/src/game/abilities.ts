import { CONFIG, EF, ROLE_INFO, type AbilityDef } from '@nevoeiro/shared';
import { sfx } from '../audio/sfx';
import { sendAction } from '../net/connection';
import { net } from '../net/netState';
import { getState, type TargetView } from '../net/store';

/** Melhor alvo de jogador: perto e na frente da câmera. */
export function pickPlayerTarget(ability: AbilityDef): TargetView | null {
  const range = ability.range ?? CONFIG.kill.range;
  const fx = Math.sin(net.cameraYaw);
  const fz = Math.cos(net.cameraYaw);
  const role = getState().role;
  let best: TargetView | null = null;
  let bestScore = Infinity;
  for (const e of net.entities.values()) {
    if (e.flags & EF.GHOST && !(e.flags & EF.ALLY)) continue;
    // assassinos não miram parceiros com matar
    if (ability.action === 'kill' && e.flags & EF.ALLY) continue;
    if (role?.team === 'assassinos' && ability.action === 'kill' && role.partners.some((p) => p.netId === e.id)) continue;
    const dx = e.rx - net.local.x;
    const dz = e.rz - net.local.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1; // -1..1
    if (range > 4 && facing < 0.55) continue; // armas de alcance médio: precisa mirar
    const score = d * (1.6 - facing);
    if (score < bestScore) {
      bestScore = score;
      best = { action: ability.action, id: e.id, name: e.flags & EF.NONAME ? '???' : e.name };
    }
  }
  return best;
}

export function pickBodyTarget(ability: AbilityDef): TargetView | null {
  const range = ability.range ?? 2.5;
  let best: TargetView | null = null;
  let bestD = Infinity;
  for (const b of net.bodies.values()) {
    const d = Math.hypot(b.x - net.local.x, b.z - net.local.z);
    if (d <= range && d < bestD) {
      bestD = d;
      best = { action: ability.action, id: b.id, name: b.n };
    }
  }
  return best;
}

export function roleAbilities(): AbilityDef[] {
  const role = getState().role;
  return role ? ROLE_INFO[role.role].abilities : [];
}

/** Usa a habilidade do slot (0 = Q, 1 = E). */
export function triggerAbility(slot: number) {
  const st = getState();
  if (st.phase !== 'playing' || !st.you?.alive || st.end) return;
  const ability = roleAbilities()[slot];
  if (!ability) return;
  const state = st.you.abilities.find((a) => a.action === ability.action);
  if (state && (state.cd > 0 || state.blocked)) {
    sfx.play('deny');
    st.pushToast({ text: state.blocked ?? `Recarregando (${Math.ceil(state.cd / 1000)}s)`, level: 'warn' });
    return;
  }
  switch (ability.target) {
    case 'none':
      sendAction({ type: ability.action });
      break;
    case 'point':
      st.set({ teleportPicking: true, mapOpen: true });
      document.exitPointerLock?.();
      return;
    case 'player': {
      const t = pickPlayerTarget(ability);
      if (!t) {
        sfx.play('deny');
        st.pushToast({ text: 'Ninguém ao alcance.', level: 'warn' });
        return;
      }
      sendAction({ type: ability.action, targetId: t.id });
      break;
    }
    case 'body': {
      const t = pickBodyTarget(ability);
      if (!t) {
        sfx.play('deny');
        st.pushToast({ text: 'Nenhum corpo por perto.', level: 'warn' });
        return;
      }
      sendAction({ type: ability.action, targetId: t.id });
      break;
    }
  }
  sfx.play('click');
}

export function confirmTeleport(x: number, z: number) {
  sendAction({ type: 'teleport', point: { x, z } });
  getState().set({ teleportPicking: false, mapOpen: false });
}
