/**
 * Tutorial da primeira partida — compacto, num canto, sem cobrir o personagem nem os botões.
 * Cada dica avança sozinha quando você faz o que ela ensina (andar, abrir o mapa, fazer uma
 * tarefa…) ou depois de alguns segundos. Só aparece na primeira partida (localStorage);
 * dá para rever em Configurações → "Rever tutorial".
 */
import { useEffect, useRef, useState } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState, useStore } from '../net/store';
import { roleColor } from '../theme';
import { Icon } from './Icons';

const KEY = 'nevoeiro.tutorial.v3';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // sem armazenamento: não insiste
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* modo privado: tudo bem */
  }
}

/** Configurações → "Rever tutorial". */
export function replayTutorial() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ok */
  }
  getState().set({ tutorialRun: getState().tutorialRun + 1 });
}

interface Step {
  icon: string;
  title: string;
  text: string;
  /** segundos até avançar sozinho */
  secs: number;
  /** a ação ensinada aconteceu? */
  done?: () => boolean;
}

export function Tutorial({ touch }: { touch: boolean }) {
  const role = useStore((s) => s.role);
  const run = useStore((s) => s.tutorialRun);
  const [open, setOpen] = useState(() => !tutorialSeen());
  const [step, setStep] = useState(0);
  const startedAt = useRef(performance.now());
  // some enquanto há uma janela aberta (tarefa, mapa, caderno, carta do papel)
  const busy = useStore((s) => !!s.taskOpen || s.mapOpen || s.notebookOpen || s.showRole || s.settingsOpen);

  // "Rever tutorial" nas Configurações
  useEffect(() => {
    if (run > 0) {
      setStep(0);
      setOpen(true);
    }
  }, [run]);

  useEffect(() => {
    if (!open) return;
    useStore.getState().set({ tutorialOpen: true });
    return () => useStore.getState().set({ tutorialOpen: false });
  }, [open]);

  const info = role ? ROLE_INFO[role.role] : null;
  const killer = info?.team === 'assassinos';
  const steps: Step[] = info
    ? [
        {
          icon: 'run',
          title: 'Andar',
          text: touch ? 'Arraste à esquerda para andar · à direita para olhar.' : 'WASD anda · Shift corre · mouse gira a câmera.',
          secs: 9,
          done: () => Math.hypot(net.you?.vx ?? 0, net.you?.vz ?? 0) > 0.8,
        },
        {
          icon: role!.role,
          title: info.name,
          text: info.abilities.length ? `${info.abilities.map((a) => a.label).join(' e ')}: ${touch ? 'botões à direita' : 'Q e E'}.` : 'Sem habilidade: observe e se esconda.',
          secs: 8,
        },
        {
          icon: 'tasks',
          title: killer ? 'Tarefas falsas' : 'Tarefas',
          text: killer ? `Finja nos losangos (${touch ? 'botão' : 'F'}) para se misturar.` : `Siga os losangos dourados e aperte ${touch ? 'o botão' : 'F'}.`,
          secs: 9,
          done: () => !!getState().taskOpen,
        },
        {
          icon: 'map',
          title: 'Mapa e pistas',
          text: touch ? 'Toque no minimapa · 📄 abre o caderno de pistas.' : 'M abre o mapa · J o caderno · segure Tab para ver seu papel.',
          secs: 8,
          done: () => getState().mapOpen || getState().notebookOpen,
        },
        {
          icon: 'hide',
          title: 'Esconda-se',
          text: 'Armários, feno e arbustos escondem você.',
          secs: 7,
        },
      ]
    : [];

  // avança pela ação ou pelo tempo
  useEffect(() => {
    if (!open || !steps.length) return;
    startedAt.current = performance.now();
    const h = setInterval(() => {
      const s = steps[step];
      if (!s) return;
      const elapsed = (performance.now() - startedAt.current) / 1000;
      if ((s.done && elapsed > 0.8 && s.done()) || elapsed > s.secs) next();
    }, 250);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, steps.length]);

  const close = () => {
    markSeen();
    setOpen(false);
  };
  function next() {
    if (step >= steps.length - 1) close();
    else setStep((v) => v + 1);
  }

  if (!open || !info || busy) return null;
  const s = steps[step];
  return (
    <div className="tutorial glass" role="status" aria-live="polite">
      <span className="tut-icon" style={{ color: step === 1 ? roleColor(role!.role) : undefined }}>
        <Icon name={s.icon} size={18} />
      </span>
      <div className="tut-body">
        <strong>{s.title}</strong>
        <span>{s.text}</span>
        <span className="tut-bar" key={step} style={{ animationDuration: `${s.secs}s` }} aria-hidden />
      </div>
      <span className="tut-count">{step + 1}/{steps.length}</span>
      <button className="tut-close" onClick={close} aria-label="Fechar tutorial">✕</button>
    </div>
  );
}
