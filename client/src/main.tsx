import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { net, pushFx } from './net/netState';
import { useStore } from './net/store';
import { currentRoom } from './net/connection';
import { voice } from './voice/VoiceManager';
import { applyThemeCss } from './theme';
import { installGlobalTouchGuard } from './ui/touch';
import { TASK_STATIONS } from '@nevoeiro/shared';
import './styles.css';

applyThemeCss();
installGlobalTouchGuard();

// depuração no console do navegador (só em desenvolvimento)
if (import.meta.env.DEV) Object.assign(window, { __nevoeiro: { net, store: useStore, voice, pushFx, currentRoom, stations: TASK_STATIONS } });

const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('anim');
if (preview) {
  void import('./dev/AnimPreview').then(({ AnimPreview }) => createRoot(document.getElementById('root')!).render(<AnimPreview />));
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// PWA: service worker só em produção e em http(s) (no Electron/Capacitor não é necessário)
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
