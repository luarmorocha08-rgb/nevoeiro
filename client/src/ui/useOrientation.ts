import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

const read = (): Orientation =>
  typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

/**
 * Orientação atual da tela. Ao virar o celular o componente re-renderiza com o novo layout
 * (o canvas 3D se ajusta sozinho) — sem recarregar e sem perder o estado da partida.
 */
export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>(read);
  useEffect(() => {
    const update = () => setO(read());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    screen.orientation?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      screen.orientation?.removeEventListener?.('change', update);
    };
  }, []);
  return o;
}
