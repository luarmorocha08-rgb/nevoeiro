/**
 * Interface das tarefas: lista, botão de interação e os minijogos
 * (segurar, acertar o tempo, repetir sequência). Teclado, mouse e toque.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATIONS, taskStation, type TaskStation } from '@nevoeiro/shared';
import { sfx } from '../audio/sfx';
import { cancelTask, finishTask, openTask, taskMinRemaining } from '../game/tasks';
import { useStore } from '../net/store';
import { THEME } from '../theme';
import { Icon } from './Icons';
import { useTouchGuard } from './touch';

function placeName(st: TaskStation): string {
  if (st.location === 'estrada') return 'Estradas';
  return LOCATIONS.find((l) => l.id === st.location)?.name ?? '';
}

/** Lista de tarefas (canto esquerdo). */
export function TaskList({ compact }: { compact: boolean }) {
  const tasks = useStore((s) => s.tasks);
  const collapsed = useStore((s) => s.tasksCollapsed);
  const set = useStore((s) => s.set);
  const alive = useStore((s) => s.you?.alive ?? true);
  // no celular começa recolhida
  useEffect(() => {
    if (compact) set({ tasksCollapsed: true });
  }, [compact, set]);
  if (!tasks || !alive) return null;
  const done = tasks.list.filter((t) => t.done).length;
  return (
    <div className={`task-list glass${tasks.fake ? ' fake' : ''}${collapsed ? ' collapsed' : ''}`}>
      <button className="task-list-head" onClick={() => set({ tasksCollapsed: !collapsed })} aria-expanded={!collapsed}>
        <Icon name="tasks" size={16} />
        <span>{tasks.fake ? 'Tarefas falsas' : 'Tarefas'}</span>
        <span className="task-count">{done}/{tasks.list.length}</span>
        <span className="chev" aria-hidden>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <>
          {tasks.fake && <p className="task-hint">Finja fazer para se misturar — não contam para a vila.</p>}
          <ul>
            {tasks.list.map((t) => {
              const st = taskStation(t.id);
              if (!st) return null;
              return (
                <li key={t.id} className={t.done ? 'done' : ''}>
                  <span className="task-check">{t.done ? <Icon name="check" size={13} /> : <Icon name={st.icon} size={13} />}</span>
                  <span className="task-name">
                    {st.name}
                    <em>{placeName(st)}</em>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Barra de progresso da vila (no topo). */
export function VillageProgress() {
  const done = useStore((s) => s.counts?.tasksDone ?? 0);
  const needed = useStore((s) => s.counts?.tasksNeeded ?? 0);
  if (!needed) return null;
  const pct = Math.min(100, (done / needed) * 100);
  return (
    <span className="c-tasks" title="Tarefas da vila: barra cheia = vitória dos inocentes">
      <Icon name="lamp" size={13} />
      <span className="goal-bar village">
        <span style={{ width: `${pct}%` }} />
      </span>
      {Math.round(pct)}%
    </span>
  );
}

/** Botão "fazer tarefa" quando você está perto de uma estação sua. */
export function TaskPrompt({ touch }: { touch: boolean }) {
  const near = useStore((s) => s.taskNear);
  const open = useStore((s) => s.taskOpen);
  const fake = useStore((s) => s.tasks?.fake ?? false);
  if (!near || open) return null;
  const st = taskStation(near);
  if (!st) return null;
  return (
    <button className={`task-prompt${touch ? ' touch' : ''}`} onClick={openTask}>
      {!touch && <kbd>F</kbd>}
      <Icon name={st.icon} size={20} />
      <span>
        {st.name}
        {fake && <em> (fingir)</em>}
      </span>
    </button>
  );
}

/** Minijogo aberto. */
export function TaskGame({ touch }: { touch: boolean }) {
  const id = useStore((s) => s.taskOpen);
  const fake = useStore((s) => s.tasks?.fake ?? false);
  const st = id ? taskStation(id) : undefined;
  if (!st) return null;
  return (
    <div className="task-game-wrap" role="dialog" aria-label={st.name}>
      <div className="task-game glass">
        <header>
          <span className="task-game-icon"><Icon name={st.icon} size={22} /></span>
          <div>
            <h3>{st.name}</h3>
            <p>{placeName(st)}{fake ? ' · fingindo' : ''}</p>
          </div>
          <button className="round-btn" aria-label="Sair da tarefa" onClick={cancelTask}>✕</button>
        </header>
        {st.kind === 'hold' && <HoldGame key={st.id} st={st} touch={touch} />}
        {st.kind === 'timing' && <TimingGame key={st.id} touch={touch} />}
        {st.kind === 'sequence' && <SequenceGame key={st.id} touch={touch} />}
      </div>
    </div>
  );
}

/** Depois de vencer o minijogo, mostra quanto falta (tempo mínimo da tarefa). */
function FinishingBar() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setLeft(taskMinRemaining()), 100);
    return () => clearInterval(h);
  }, []);
  return left > 0 ? <p className="task-finishing">Terminando… {Math.ceil(left / 1000)}s</p> : null;
}

function useWin() {
  const [won, setWon] = useState(false);
  const done = useRef(false);
  return {
    won,
    win: () => {
      if (done.current) return;
      done.current = true;
      setWon(true);
      void finishTask();
    },
  };
}

// ------------------------------------------------------------------ segurar

const HOLD_TEXT: Record<string, string> = {
  lamp: 'Segure para acender o pavio',
  water: 'Segure para puxar a corda',
  grave: 'Segure para esfregar a lápide',
  fire: 'Segure para soprar as brasas',
};

function HoldGame({ st, touch }: { st: TaskStation; touch: boolean }) {
  const [progress, setProgress] = useState(0);
  const holding = useRef(false);
  const [held, setHeld] = useState(false);
  const { won, win } = useWin();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyF') {
        e.preventDefault();
        holding.current = true;
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyF') {
        holding.current = false;
        setHeld(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    let last = performance.now();
    let raf = 0;
    let tick = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (t - last) / 1000;
      last = t;
      if (!holding.current) return;
      setProgress((p) => {
        const n = Math.min(1, p + dt / st.seconds);
        if (Math.floor(n * 8) > tick) {
          tick = Math.floor(n * 8);
          sfx.play('click', 0.6);
        }
        return n;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [st.seconds]);
  useEffect(() => {
    if (progress >= 1) win();
  }, [progress, win]);

  // Toque/mouse com listeners nativos: captura o ponteiro (o dedo pode deslizar um pouco
  // sem soltar), cancela o toque longo do sistema e pausa se o dedo sair de verdade do botão.
  const btn = useRef<HTMLButtonElement>(null);
  useTouchGuard(btn);
  useEffect(() => {
    const el = btn.current;
    if (!el) return;
    const SLACK = 48; // px de folga além da borda do botão
    let pointer: number | null = null;
    const setHold = (on: boolean) => {
      if (holding.current === on) return;
      holding.current = on;
      setHeld(on);
    };
    const inside = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return e.clientX > r.left - SLACK && e.clientX < r.right + SLACK && e.clientY > r.top - SLACK && e.clientY < r.bottom + SLACK;
    };
    const down = (e: PointerEvent) => {
      if (pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* sem captura: ainda funciona pelos eventos do botão */
      }
      setHold(true);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      setHold(inside(e)); // saiu de verdade: pausa; voltou: continua
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      setHold(false);
    };
    const leave = (e: PointerEvent) => {
      // com captura o "leave" só chega ao soltar; sem captura (mouse), sair pausa
      if (e.pointerId === pointer && !el.hasPointerCapture?.(e.pointerId)) setHold(false);
    };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.removeEventListener('lostpointercapture', end);
      el.removeEventListener('pointerleave', leave);
      holding.current = false;
    };
  }, []);

  return (
    <div className="task-hold">
      <button ref={btn} className={`hold-btn${held ? ' held' : ''}${won ? ' won' : ''}`} aria-label="Segurar">
        <span className="hold-ring" style={{ ['--p' as string]: `${progress * 360}deg` }} aria-hidden />
        <span className="hold-icon"><Icon name={st.icon} size={34} color={progress > 0.98 ? THEME.warmLight : undefined} /></span>
      </button>
      <p>{won ? 'Feito!' : HOLD_TEXT[st.icon] ?? 'Segure para trabalhar'} {!touch && !won && <kbd>Espaço</kbd>}</p>
      {won && <FinishingBar />}
    </div>
  );
}

// ------------------------------------------------------------------ tempo certo

function TimingGame({ touch }: { touch: boolean }) {
  const NEED = 3;
  const [hits, setHits] = useState(0);
  const [zone, setZone] = useState(() => 0.25 + Math.random() * 0.5);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const pos = useRef(0);
  const dir = useRef(1);
  const marker = useRef<HTMLSpanElement>(null);
  const { won, win } = useWin();
  const W = 0.16;

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (t - last) / 1000;
      last = t;
      pos.current += dir.current * dt * 0.75;
      if (pos.current > 1) {
        pos.current = 1;
        dir.current = -1;
      } else if (pos.current < 0) {
        pos.current = 0;
        dir.current = 1;
      }
      if (marker.current) marker.current.style.left = `${pos.current * 100}%`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const press = () => {
    if (won) return;
    const ok = Math.abs(pos.current - zone) < W / 2;
    setFlash(ok ? 'hit' : 'miss');
    setTimeout(() => setFlash(null), 220);
    if (ok) {
      sfx.play('taskHit');
      const n = hits + 1;
      setHits(n);
      if (n >= NEED) win();
      else setZone(0.15 + Math.random() * 0.7);
    } else {
      sfx.play('taskMiss');
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyF') {
        e.preventDefault();
        if (!e.repeat) press();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const guard = useRef<HTMLDivElement>(null);
  useTouchGuard(guard);
  return (
    <div className="task-timing" ref={guard}>
      <div className={`timing-bar${flash ? ` ${flash}` : ''}`} onPointerDown={press}>
        <span className="timing-zone" style={{ left: `${(zone - W / 2) * 100}%`, width: `${W * 100}%` }} />
        <span className="timing-marker" ref={marker} />
      </div>
      <div className="timing-pips" aria-label={`${hits} de ${NEED}`}>
        {Array.from({ length: NEED }, (_, i) => (
          <span key={i} className={i < hits ? 'on' : ''} />
        ))}
      </div>
      <button className="btn task-action" onPointerDown={press} disabled={won}>
        {won ? 'Feito!' : 'Agora!'} {!touch && !won && <kbd>Espaço</kbd>}
      </button>
      {won && <FinishingBar />}
    </div>
  );
}

// ------------------------------------------------------------------ sequência

const SYMBOLS = ['▲', '●', '■', '◆'];

function SequenceGame({ touch }: { touch: boolean }) {
  const seq = useMemo(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)), []);
  const [step, setStep] = useState(0);
  const [shake, setShake] = useState(false);
  const { won, win } = useWin();

  const press = (k: number) => {
    if (won) return;
    if (seq[step] === k) {
      sfx.play('taskHit');
      const n = step + 1;
      setStep(n);
      if (n >= seq.length) win();
    } else {
      sfx.play('taskMiss');
      setStep(0);
      setShake(true);
      setTimeout(() => setShake(false), 300);
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (k >= 0 && !e.repeat) {
        e.preventDefault();
        press(k);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const guard = useRef<HTMLDivElement>(null);
  useTouchGuard(guard);
  return (
    <div className={`task-seq${shake ? ' shake' : ''}`} ref={guard}>
      <div className="seq-target" aria-label="Sequência">
        {seq.map((k, i) => (
          <span key={i} className={i < step ? 'ok' : i === step ? 'cur' : ''}>{SYMBOLS[k]}</span>
        ))}
      </div>
      <div className="seq-pad">
        {SYMBOLS.map((sym, k) => (
          <button key={k} className="seq-btn" onPointerDown={() => press(k)} disabled={won} aria-label={`Símbolo ${k + 1}`}>
            {sym}
            {!touch && <kbd>{k + 1}</kbd>}
          </button>
        ))}
      </div>
      <p>{won ? 'Feito!' : 'Repita a sequência'}</p>
      {won && <FinishingBar />}
    </div>
  );
}
