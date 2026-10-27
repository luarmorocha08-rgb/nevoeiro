/**
 * Proteção contra os gestos do sistema no celular (iOS Safari e Chrome Android):
 * toque longo abrindo "Copiar / Pesquisar / Traduzir", lupa de seleção, menu de contexto,
 * arrastar imagem e zoom de pinça. Só os campos de texto continuam selecionáveis.
 */
import { useEffect, type RefObject } from 'react';

const isTextField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Em elementos que usam pointerdown (botões de segurar, habilidades, joystick):
 * cancela o touchstart (listener NÃO passivo — o React registra os de toque como passivos
 * e aí não dá para cancelar), o menu de contexto, a seleção e o arrastar.
 * Atenção: cancelar o touchstart impede o "click" sintetizado — use só onde a ação é no pointerdown.
 */
export function useTouchGuard(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const stop = (e: Event) => {
      if (isTextField(e.target)) return;
      if (e.cancelable) e.preventDefault();
    };
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchstart', stop, opts);
    el.addEventListener('contextmenu', stop, opts);
    el.addEventListener('selectstart', stop, opts);
    el.addEventListener('dragstart', stop, opts);
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('contextmenu', stop);
      el.removeEventListener('selectstart', stop);
      el.removeEventListener('dragstart', stop);
    };
  }, [ref, enabled]);
}

let installed = false;
/**
 * Proteção global (chamada uma vez): nenhum menu de contexto, seleção, arrastar ou zoom de
 * pinça fora dos campos de texto. Funciona junto com o CSS (-webkit-touch-callout etc.).
 */
export function installGlobalTouchGuard() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const stop = (e: Event) => {
    if (isTextField(e.target)) return;
    if (e.cancelable) e.preventDefault();
  };
  document.addEventListener('contextmenu', stop, { passive: false });
  document.addEventListener('selectstart', stop, { passive: false });
  document.addEventListener('dragstart', stop, { passive: false });
  // iOS: pinça e duplo toque não dão zoom no jogo
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      if ((e as TouchEvent).touches.length > 1 && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  // se algo chegar a selecionar texto fora de um campo, limpa na hora
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && !isTextField(document.activeElement)) sel.removeAllRanges();
  });
}
