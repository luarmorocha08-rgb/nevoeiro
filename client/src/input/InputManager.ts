/**
 * Entrada unificada: teclado + mouse (desktop), joystick virtual e toques (mobile) e gamepad.
 * O jogo lê `input.sample()` a cada frame; ações discretas chegam por `input.on(...)`.
 */
export type InputAction =
  | 'ability0'
  | 'ability1'
  | 'chat'
  | 'map'
  | 'mute'
  | 'pttDown'
  | 'pttUp'
  | 'escape'
  | 'role'
  | 'roleUp'
  | 'task'
  | 'notebook';

export interface InputSample {
  /** -1..1 (direita positiva) */
  strafe: number;
  /** -1..1 (frente positiva) */
  forward: number;
  run: boolean;
  /** espectador: subir/descer */
  vertical: number;
  lookX: number;
  lookY: number;
}

type Listener = (a: InputAction) => void;

let blockKeys: () => boolean = () => false;
/** O jogo informa quando o chat está aberto (teclas viram texto, não comandos). */
export function setKeyBlocker(fn: () => boolean) {
  blockKeys = fn;
}

let taskMode: () => boolean = () => false;
/** O jogo informa quando um minijogo de tarefa está aberto (botões do controle viram teclas dele). */
export function setTaskMode(fn: () => boolean) {
  taskMode = fn;
}

/** Simula uma tecla (o minijogo escuta o teclado). */
function fakeKey(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return blockKeys() || (!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
};

class InputManager {
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private listeners = new Set<Listener>();
  private padPrev: boolean[] = [];
  private started = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  runToggle = false;

  /** valores do joystick virtual (mobile) */
  touchMove = { x: 0, y: 0 };
  sensitivity = 1;
  invertY = false;
  enabled = true;

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.emit('roleUp'); // perdeu o foco segurando Tab: fecha a carta
    });
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(a: InputAction) {
    for (const l of this.listeners) l(a);
  }

  /** O canvas chama ao pressionar o botão direito (arrastar câmera sem pointer lock). */
  beginDrag(e: { clientX: number; clientY: number }) {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  /** Deslize de câmera vindo da tela de toque. */
  addLook(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping()) {
      if (e.code === 'Escape') (document.activeElement as HTMLElement)?.blur?.();
      return;
    }
    // Tab segurado repete o keydown: sem isso o navegador troca o foco
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'KeyQ':
      case 'Digit1':
        this.emit('ability0');
        break;
      case 'KeyE':
      case 'Digit2':
        this.emit('ability1');
        break;
      case 'KeyF':
      case 'Digit3':
        this.emit('task');
        break;
      case 'KeyJ':
        this.emit('notebook');
        break;
      case 'Enter':
      case 'KeyT':
        e.preventDefault();
        this.emit('chat');
        break;
      case 'KeyM':
        this.emit('map');
        break;
      case 'KeyN':
        this.emit('mute');
        break;
      case 'KeyV':
        this.emit('pttDown');
        break;
      case 'Tab':
        e.preventDefault();
        this.emit('role'); // segurar mostra a carta; soltar fecha (roleUp)
        break;
      case 'Escape':
        this.emit('escape');
        break;
      case 'CapsLock':
        this.runToggle = !this.runToggle;
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyV') this.emit('pttUp');
    if (e.code === 'Tab') this.emit('roleUp'); // soltar o Tab fecha a carta do papel
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    } else if (this.dragging) {
      this.lookX += e.clientX - this.lastX;
      this.lookY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private pollGamepad(out: InputSample) {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = dz(pad.axes[2] ?? 0);
    const ry = dz(pad.axes[3] ?? 0);
    if (lx || ly) {
      out.strafe = lx;
      out.forward = -ly;
    }
    out.lookX += rx * 14;
    out.lookY += ry * 10;
    const b = pad.buttons.map((x) => x.pressed);
    const edge = (i: number) => b[i] && !this.padPrev[i];
    const release = (i: number) => !b[i] && this.padPrev[i];
    if (b[10] || (pad.buttons[7]?.value ?? 0) > 0.5) out.run = true; // L3 ou RT = correr
    if (taskMode()) {
      // minijogo: X segura/aperta (Espaço); A, B, X, Y = símbolos 1 a 4
      if (edge(2)) fakeKey('keydown', 'Space');
      if (release(2)) fakeKey('keyup', 'Space');
      ([0, 1, 2, 3] as const).forEach((i) => {
        if (edge(i)) fakeKey('keydown', `Digit${i + 1}`);
        if (release(i)) fakeKey('keyup', `Digit${i + 1}`);
      });
      if (edge(9)) this.emit('escape'); // Start sai da tarefa
      this.padPrev = b;
      return;
    }
    if (edge(2)) this.emit('task'); // X
    if (edge(14)) this.emit('notebook'); // direcional esquerdo
    if (edge(0)) this.emit('ability0'); // A
    if (edge(1)) this.emit('ability1'); // B
    if (edge(3)) this.emit('map'); // Y
    if (edge(9)) this.emit('role'); // Start (segurar mostra o papel)
    if (release(9)) this.emit('roleUp');
    if (edge(8)) this.emit('chat'); // Select
    if (edge(4)) this.emit('pttDown'); // LB segura = falar
    if (release(4)) this.emit('pttUp');
    if (b[12]) out.vertical = 1;
    if (b[13]) out.vertical = -1;
    this.padPrev = b;
  }

  sample(): InputSample {
    const k = this.keys;
    const typing = isTyping() || !this.enabled;
    const out: InputSample = { strafe: 0, forward: 0, run: false, vertical: 0, lookX: 0, lookY: 0 };
    if (!typing) {
      if (k.has('KeyW') || k.has('ArrowUp')) out.forward += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) out.forward -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) out.strafe += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) out.strafe -= 1;
      if (k.has('Space')) out.vertical += 1;
      if (k.has('ControlLeft') || k.has('KeyC')) out.vertical -= 1;
      out.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle;
    }
    if (this.touchMove.x || this.touchMove.y) {
      out.strafe = this.touchMove.x;
      out.forward = this.touchMove.y;
      if (Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92) out.run = true;
    }
    out.lookX = this.lookX * this.sensitivity;
    out.lookY = this.lookY * this.sensitivity * (this.invertY ? -1 : 1);
    this.lookX = 0;
    this.lookY = 0;
    this.pollGamepad(out);
    const len = Math.hypot(out.strafe, out.forward);
    if (len > 1) {
      out.strafe /= len;
      out.forward /= len;
    }
    return out;
  }
}

export const input = new InputManager();
