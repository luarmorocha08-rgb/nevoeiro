import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { net } from './net/netState';
import { useStore } from './net/store';
import { voice } from './voice/VoiceManager';
import './styles.css';

// depuração no console do navegador (só em desenvolvimento)
if (import.meta.env.DEV) Object.assign(window, { __nevoeiro: { net, store: useStore, voice } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: service worker só em produção e em http(s) (no Electron/Capacitor não é necessário)
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
