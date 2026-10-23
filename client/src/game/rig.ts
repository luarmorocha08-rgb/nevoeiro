/**
 * Animação procedural do personagem placeholder (sem arquivos de animação).
 *
 * O esqueleto tem quadril, coluna, cabeça, ombros/cotovelos e quadris/joelhos/tornozelos.
 * A fase do passo avança pela DISTÂNCIA percorrida (não pelo tempo), então o pé não
 * "patina" no chão em nenhuma velocidade. Parado, andando e correndo se misturam
 * suavemente pela velocidade; também há inclinação ao acelerar e ao fazer curva,
 * respiração parado, olhar em volta e a pose de "fazendo tarefa".
 */
import * as THREE from 'three';
import { CONFIG } from '@nevoeiro/shared';

type Joint = THREE.Object3D;
export interface Rig {
  root: Joint;
  pelvis: Joint;
  spine: Joint;
  head: Joint;
  shoulderL: Joint;
  shoulderR: Joint;
  elbowL: Joint;
  elbowR: Joint;
  hipL: Joint;
  hipR: Joint;
  kneeL: Joint;
  kneeR: Joint;
  ankleL: Joint;
  ankleR: Joint;
}

export interface RigState {
  phase: number;
  speed: number;
  walkW: number;
  runW: number;
  taskW: number;
  tiredW: number;
  lean: number;
  bank: number;
  lastX: number;
  lastZ: number;
  lastYaw: number;
  lastSpeed: number;
  init: boolean;
  lookYaw: number;
  lookTarget: number;
  lookTimer: number;
  time: number;
}

export function createRigState(): RigState {
  return {
    phase: Math.random() * Math.PI * 2,
    speed: 0,
    walkW: 0,
    runW: 0,
    taskW: 0,
    tiredW: 0,
    lean: 0,
    bank: 0,
    lastX: 0,
    lastZ: 0,
    lastYaw: 0,
    lastSpeed: 0,
    init: false,
    lookYaw: 0,
    lookTarget: 0,
    lookTimer: 1 + Math.random() * 3,
    time: Math.random() * 100,
  };
}

/** Alturas do esqueleto (m) — compartilhadas com a montagem das malhas. */
export const RIG = {
  hipY: 0.95,
  hipX: 0.095,
  thigh: 0.44,
  shin: 0.43,
  shoulderY: 0.47,
  shoulderX: 0.205,
  upperArm: 0.29,
  neckY: 0.58,
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const tmp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export interface RigInput {
  /** fazendo tarefa (de verdade ou fingindo) */
  task: boolean;
  /** cansado (stamina zerada) */
  tired: boolean;
  /** velocidade conhecida (m/s); se ausente, mede pela posição */
  speed?: number;
}

/**
 * Atualiza a pose. Mede velocidade, aceleração e curva pela posição/rotação MUNDIAL
 * do personagem, então funciona igual para o jogador local e os remotos.
 */
export function animateRig(rig: Rig, s: RigState, input: RigInput, rawDt: number): void {
  const dt = Math.min(rawDt, 0.1);
  if (dt <= 0) return;
  s.time += dt;

  // ---------- movimento medido no mundo
  rig.root.parent?.getWorldPosition(tmp);
  rig.root.parent?.getWorldQuaternion(tmpQ);
  tmpE.setFromQuaternion(tmpQ, 'YXZ');
  const yaw = tmpE.y;
  if (!s.init) {
    s.init = true;
    s.lastX = tmp.x;
    s.lastZ = tmp.z;
    s.lastYaw = yaw;
  }
  const dx = tmp.x - s.lastX;
  const dz = tmp.z - s.lastZ;
  s.lastX = tmp.x;
  s.lastZ = tmp.z;
  let measured = Math.hypot(dx, dz) / dt;
  if (measured > 15) measured = 0; // teleporte
  const target = input.speed ?? measured;
  const prevSpeed = s.speed;
  s.speed = damp(s.speed, target, 10, dt);
  const accel = (s.speed - prevSpeed) / dt;
  const yawRate = wrap(yaw - s.lastYaw) / dt;
  s.lastYaw = yaw;

  // ---------- pesos de mistura
  const walkSpeed = CONFIG.move.walkSpeed;
  const runSpeed = CONFIG.move.runSpeed;
  s.walkW = damp(s.walkW, smooth(0.15, 1.1, s.speed), 12, dt);
  s.runW = damp(s.runW, smooth(walkSpeed + 0.35, runSpeed - 0.5, s.speed), 8, dt);
  s.taskW = damp(s.taskW, input.task ? 1 : 0, 6, dt);
  s.tiredW = damp(s.tiredW, input.tired ? 1 : 0, 3, dt);
  const w = s.walkW;
  const r = s.runW;

  // ---------- fase do passo: avança pela distância (sem patinar)
  const stride = lerp(CONFIG.audio.stepLengthWalk * 2, CONFIG.audio.stepLengthRun * 2, r);
  if (s.speed > 0.05) s.phase += ((s.speed * dt) / stride) * Math.PI * 2;
  else s.phase += (Math.round(s.phase / Math.PI) * Math.PI - s.phase) * Math.min(1, dt * 4); // volta à pose neutra
  const p = s.phase;
  const sinP = Math.sin(p);
  const cosP = Math.cos(p);

  // ---------- pernas
  const thighA = lerp(0.5, 0.95, r) * w;
  const kneeK = lerp(0.95, 1.75, r) * w;
  const kneeBase = lerp(0.04, 0.28, r) * w;
  const leg = (hip: Joint, knee: Joint, ankle: Joint, ph: number) => {
    const forward = Math.sin(ph); // >0 perna à frente
    const swing = Math.max(0, Math.cos(ph + 0.35)); // joelho dobra no balanço
    const thigh = -thighA * forward - kneeBase * 0.4;
    const k = kneeBase + kneeK * swing * swing;
    hip.rotation.x = thigh - s.taskW * 0.35;
    knee.rotation.x = k + s.taskW * 0.55;
    ankle.rotation.x = -(thigh + k) * 0.55 + (forward < 0 ? -forward * 0.25 * w : 0) - s.taskW * 0.2;
  };
  leg(rig.hipL, rig.kneeL, rig.ankleL, p);
  leg(rig.hipR, rig.kneeR, rig.ankleR, p + Math.PI);
  // pernas levemente abertas parado, juntas correndo
  // (hipL fica em -x: abrir = girar para -x)
  rig.hipL.rotation.z = -lerp(0.05, 0.02, w);
  rig.hipR.rotation.z = lerp(0.05, 0.02, w);

  // ---------- quadril: sobe e desce 2x por passada, gira e balança
  const bobAmp = lerp(0.022, 0.045, r) * w;
  const crouch = r * 0.06 + s.taskW * 0.1 + s.tiredW * 0.03;
  const breath = Math.sin(s.time * (1.6 + s.tiredW * 2.4));
  rig.pelvis.position.y = RIG.hipY - crouch + bobAmp * Math.cos(2 * p) - bobAmp * 0.5;
  // quadril firme: só um leve giro natural, sem balançar para os lados
  rig.pelvis.rotation.y = lerp(0.07, 0.06, r) * w * sinP;
  rig.pelvis.rotation.z = 0;

  // ---------- inclinação: corrida, aceleração, cansaço e tarefa
  const leanTarget = lerp(0.03, 0.14, r) * w + Math.max(-0.06, Math.min(0.1, accel * 0.02)) + s.tiredW * 0.18 + s.taskW * 0.28;
  s.lean = damp(s.lean, leanTarget, 6, dt);
  // curva: inclina para dentro (mais rápido = mais inclinação)
  // sem inclinação lateral nas curvas: o corpo fica reto
  void yawRate;
  s.bank = 0;
  rig.root.rotation.z = 0;

  // coluna: contra-gira em relação ao quadril e respira parado
  rig.spine.rotation.x = s.lean;
  rig.spine.rotation.y = -rig.pelvis.rotation.y * 0.8;
  rig.spine.rotation.z = 0;
  const breathAmp = (1 - w) * (0.012 + s.tiredW * 0.025);
  rig.spine.scale.set(1 + breath * breathAmp * 0.5, 1 + breath * breathAmp, 1 + breath * breathAmp * 0.7);

  // ---------- braços: opostos às pernas; correndo dobram os cotovelos
  const armA = lerp(0.4, 0.8, r) * w * (1 - s.tiredW * 0.4);
  const elbowBase = lerp(0.18, 1.35, r) * w + (1 - w) * 0.1;
  /** side: lado do ombro no eixo x (-1 ou +1). ph: fase deste braço (>0 = à frente). */
  const arm = (sh: Joint, el: Joint, side: number, ph: number) => {
    const forward = Math.sin(ph);
    // parado: balanço leve; tarefa: braços à frente trabalhando
    const idleSway = (1 - w) * 0.04 * Math.sin(s.time * 1.2 + side);
    const work = Math.sin(s.time * 7 + side * 1.3);
    // rotação x negativa leva a mão para frente
    const swingX = -armA * forward + idleSway;
    sh.rotation.x = lerp(swingX, -1.05 + work * 0.12, s.taskW);
    // braços um pouco afastados do quadril (sem atravessar o corpo)
    sh.rotation.z = side * (lerp(0.11, 0.14, r) * w + (1 - w) * 0.1 + s.taskW * -0.08);
    const elbow = elbowBase + Math.max(0, forward) * 0.25 * w;
    el.rotation.x = -lerp(elbow, 0.55 + work * 0.15, s.taskW);
  };
  // cada braço vai para frente junto com a perna do lado oposto
  arm(rig.shoulderL, rig.elbowL, -1, p + Math.PI);
  arm(rig.shoulderR, rig.elbowR, 1, p);

  // ---------- cabeça: estabiliza, olha em volta parado, olha para baixo na tarefa
  s.lookTimer -= dt;
  if (s.lookTimer <= 0) {
    s.lookTimer = 2 + Math.random() * 4;
    s.lookTarget = (Math.random() - 0.5) * 1.0;
  }
  s.lookYaw = damp(s.lookYaw, (1 - w) * (1 - s.taskW) * s.lookTarget, 3, dt);
  rig.head.rotation.y = s.lookYaw - rig.spine.rotation.y * 0.6;
  rig.head.rotation.x = -s.lean * 0.65 + s.taskW * 0.45 + bobAmp * Math.cos(2 * p) * 1.5;
  rig.head.rotation.z = 0;
}

/** Pose largada do corpo caído (variação estável por skin). */
export function poseDead(rig: Rig, seed: string): void {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const v = (k: number) => (((h >> k) & 255) / 255) * 2 - 1;
  rig.shoulderL.rotation.set(-0.3 + v(1) * 0.3, 0, -0.9 - v(2) * 0.4);
  rig.shoulderR.rotation.set(-0.2 + v(3) * 0.3, 0, 1.1 + v(4) * 0.4);
  rig.elbowL.rotation.x = -0.4 - Math.abs(v(5)) * 0.5;
  rig.elbowR.rotation.x = -0.2;
  rig.hipL.rotation.set(-0.15, 0, -0.18);
  rig.hipR.rotation.set(-0.5 - Math.abs(v(6)) * 0.3, 0, 0.12);
  rig.kneeR.rotation.x = 0.7 + Math.abs(v(7)) * 0.3;
  rig.kneeL.rotation.x = 0.1;
  rig.head.rotation.set(0.15, 0.5 * Math.sign(v(8) || 1), 0);
}
