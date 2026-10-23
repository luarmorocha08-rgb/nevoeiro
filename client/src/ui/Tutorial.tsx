import { useEffect, useState } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { useStore } from '../net/store';
import { roleColor } from '../theme';
import { Icon } from './Icons';

const KEY = 'nevoeiro.tutorial.v1';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

/** Cartões curtos na primeira partida: controles, sua habilidade, objetivo e esconderijos. */
export function Tutorial({ touch }: { touch: boolean }) {
  const role = useStore((s) => s.role);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(() => !seen());

  useEffect(() => {
    if (!open) return;
    useStore.getState().set({ tutorialOpen: true });
    return () => useStore.getState().set({ tutorialOpen: false });
  }, [open]);

  if (!open || !role) return null;
  const info = ROLE_INFO[role.role];
  const color = roleColor(role.role);
  const cards = [
    {
      icon: 'run',
      title: 'Movimento',
      text: touch
        ? 'Arraste no lado esquerdo para andar (o joystick aparece onde você tocar). Arraste no lado direito para girar a câmera. O botão de corrida gasta stamina.'
        : 'WASD anda, Shift corre (gasta stamina), mouse gira a câmera — clique na tela para travar o cursor. M abre o mapa, Tab mostra seu papel.',
    },
    {
      icon: role.role,
      title: `Seu papel: ${info.name}`,
      text: info.abilities.length
        ? `${info.description} Use ${touch ? 'os botões redondos' : 'Q e E'}; o alvo mais próximo à sua frente ganha um contorno.`
        : `${info.description}`,
    },
    {
      icon: 'chat',
      title: 'Converse e desconfie',
      text: `Não há votação: a voz e o texto só alcançam quem está perto (${touch ? 'botão de chat' : 'Enter'} para escrever). Cada morte gera um alerta e um marcador no mapa por 10s.`,
    },
    {
      icon: 'hide',
      title: 'Esconda-se',
      text: 'Armários, montes de feno e arbustos altos escondem você de todos — menos do Rastreador com os óculos de calor.',
    },
  ];
  const card = cards[step];
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ok */
    }
    setOpen(false);
  };
  return (
    <div className="tutorial panel" role="dialog" aria-label="Tutorial">
      <h4>
        <Icon name={card.icon} size={20} color={step === 1 ? color : undefined} /> {card.title}
      </h4>
      <p>{card.text}</p>
      <div className="tut-foot">
        <div className="dots">
          {cards.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <button className="btn small ghost" onClick={close}>Pular</button>
        <button className="btn small primary" onClick={() => (step < cards.length - 1 ? setStep(step + 1) : close())}>
          {step < cards.length - 1 ? 'Próximo' : 'Jogar'}
        </button>
      </div>
    </div>
  );
}
