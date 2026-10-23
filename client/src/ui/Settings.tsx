import { useState } from 'react';
import { QUALITY_LABEL, detectQuality, type QualitySetting } from '../quality';
import { serverUrl } from '../net/connection';
import { useStore } from '../net/store';
import { voice } from '../voice/VoiceManager';

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const set = useStore((s) => s.set);
  const [server, setServer] = useState(settings.serverUrl);
  if (!open) return null;
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && set({ settingsOpen: false })}>
      <div className="panel settings">
        <h2 className="section-title">◇ Configurações</h2>
        <label className="field">
          <span>Qualidade gráfica <em className="muted">(automática detectou: {QUALITY_LABEL[detectQuality()]})</em></span>
          <div className="seg">
            {(['auto', 'low', 'medium', 'high'] as QualitySetting[]).map((q) => (
              <button key={q} className={settings.quality === q ? 'on' : ''} onClick={() => update({ quality: q })}>
                {QUALITY_LABEL[q]}
              </button>
            ))}
          </div>
        </label>
        <label className="field row">
          <input
            type="checkbox"
            checked={settings.pushToTalk}
            onChange={(e) => {
              update({ pushToTalk: e.target.checked });
              void voice.applyMic();
            }}
          />
          <span>Apertar para falar (segure V · LB no controle · botão 🎙 no celular)</span>
        </label>
        <label className="field">
          <span>Sensibilidade da câmera: {settings.sensitivity.toFixed(1)}</span>
          <input type="range" min={0.3} max={2.5} step={0.1} value={settings.sensitivity} onChange={(e) => update({ sensitivity: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Volume geral: {Math.round(settings.masterVolume * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.masterVolume} onChange={(e) => update({ masterVolume: Number(e.target.value) })} />
        </label>
        <label className="field row">
          <input type="checkbox" checked={settings.invertY} onChange={(e) => update({ invertY: e.target.checked })} />
          <span>Inverter eixo vertical</span>
        </label>
        <label className="field">
          <span>Servidor (vazio = padrão: {serverUrl()})</span>
          <input value={server} placeholder="wss://seu-servidor:2567" onChange={(e) => setServer(e.target.value)} onBlur={() => update({ serverUrl: server.trim() })} />
        </label>
        <div className="controls-help">
          <strong>Controles</strong>
          <span>WASD andar · Shift correr · mouse câmera (clique para travar) · Q/E habilidades · Enter chat · M mapa · N mutar · V falar · Tab ver papel</span>
          <span>Controle: analógicos · A/B habilidades · RT correr · Y mapa · LB falar · Start papel</span>
        </div>
        <button className="btn primary" onClick={() => set({ settingsOpen: false })}>Fechar</button>
      </div>
    </div>
  );
}
