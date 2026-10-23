import { useEffect, useState } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { voice } from '../voice/VoiceManager';
import { net } from '../net/netState';
import { useStore } from '../net/store';
import { isTouchDevice } from '../quality';
import { AbilityBar } from './AbilityBar';
import { Chat } from './Chat';
import { EndScreen } from './EndScreen';
import { MapOverlay, Minimap } from './Minimap';
import { RoleReveal } from './RoleReveal';
import { TouchControls } from './TouchControls';

export function Hud() {
  const touch = isTouchDevice();
  const phase = useStore((s) => s.phase);
  const end = useStore((s) => s.end);
  const conn = useStore((s) => s.conn);
  const alive = useStore((s) => s.you?.alive ?? true);
  const locked = useStore((s) => s.pointerLocked);
  const compact = touch || window.innerWidth < 760;

  return (
    <div className={`hud${touch ? ' touch' : ''}`}>
      {touch && !end && <TouchControls />}
      <TopBar />
      <Alerts />
      <Toasts />
      <div className="hud-right-top">
        <Minimap size={compact ? 108 : 168} />
        <VoiceWidget touch={touch} />
      </div>
      <ExaminePanel />
      <SpectatorBanner />
      <StatusEffects />
      <Chat compact={compact} />
      {phase === 'playing' && !end && <AbilityBar touch={touch} />}
      {!touch && !locked && phase === 'playing' && alive && !end && (
        <div className="click-hint">Clique na tela para controlar a câmera · Esc libera o mouse</div>
      )}
      {!touch && alive && phase === 'playing' && <div className="crosshair" />}
      <MapOverlay />
      <RoleReveal />
      <EndScreen />
      {conn === 'reconnecting' && (
        <div className="overlay reconnect">
          <div className="panel">
            <h2>Conexão perdida</h2>
            <p>Tentando reconectar à sala…</p>
            <div className="spinner" />
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const role = useStore((s) => s.role);
  const counts = useStore((s) => s.counts);
  const you = useStore((s) => s.you);
  const set = useStore((s) => s.set);
  if (!role) return null;
  const info = ROLE_INFO[role.role];
  const dead = counts?.deadInnocents ?? 0;
  const need = counts?.killsNeeded ?? role.killsNeeded;
  return (
    <div className="topbar">
      <button className="role-chip" style={{ borderColor: info.color }} onClick={() => set({ showRole: true })}>
        <span className="role-dot" style={{ background: info.color }} />
        <span className="role-name">{info.name}</span>
        <span className="role-team">{info.team === 'assassinos' ? 'assassino' : 'inocente'}</span>
      </button>
      {counts && (
        <div className="counter" title="Inocentes vivos · mortes que os assassinos precisam">
          <span className="c-alive">◇ {counts.aliveInnocents}/{counts.totalInnocents} inocentes vivos</span>
          <span className="c-goal">
            <span className="goal-bar"><span style={{ width: `${Math.min(100, (dead / need) * 100)}%` }} /></span>
            ✝ {dead}/{need}
          </span>
        </div>
      )}
      {you?.disguise && <span className="pill morph">🎭 Disfarçado de {you.disguise}</span>}
      {you?.invisible && <span className="pill ghost">👻 Invisível</span>}
      {you?.thermal && <span className="pill thermal">🌡 Visão térmica</span>}
      {you?.zombie === 'voltando' && <span className="pill zombie">⚰ Voltando em {Math.ceil((you.zombieReturnIn ?? 0) / 1000)}s</span>}
      {you?.zombie === 'retornou' && <span className="pill zombie">⚰ Morto-vivo · 1 morte</span>}
    </div>
  );
}

function Alerts() {
  const alerts = useStore((s) => s.alerts);
  const [, setT] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setT((t) => t + 1), 1000);
    return () => clearInterval(h);
  }, []);
  const now = Date.now();
  const visible = alerts.filter((a) => now - a.at < 7000 || now - a.at < 0);
  return (
    <div className="alerts">
      {visible.map((a) => (
        <div key={a.id} className={`alert ${a.kind}`}>
          <span className="alert-icon">{a.kind === 'revive' ? '✦' : a.kind === 'arrest' ? '⛓' : '✝'}</span>
          {a.text}
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!toasts.length) return;
    const h = setTimeout(() => set({ toasts: toasts.filter((t) => t.until > Date.now()) }), 1000);
    return () => clearTimeout(h);
  }, [toasts, set]);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>{t.text}</div>
      ))}
    </div>
  );
}

function ExaminePanel() {
  const ex = useStore((s) => s.examine);
  const set = useStore((s) => s.set);
  if (!ex) return null;
  const m = Math.floor(ex.secondsAgo / 60);
  const s = ex.secondsAgo % 60;
  return (
    <div className="examine panel">
      <p className="eyebrow">🔍 Exame do corpo</p>
      <h3>{ex.victimName}</h3>
      <p>Morreu há <strong>{m > 0 ? `${m}min ${s}s` : `${s}s`}</strong> — {ex.location}</p>
      <p>Causa: <strong className="killer-type">{ex.killer}</strong></p>
      <button className="btn small" onClick={() => set({ examine: null })}>Fechar</button>
    </div>
  );
}

function SpectatorBanner() {
  const you = useStore((s) => s.you);
  if (!you || you.alive) return null;
  return (
    <div className="spectator-banner">
      {you.arrested ? '⛓ Você foi preso' : you.zombie === 'voltando' ? '⚰ Sob a terra…' : '✝ Você morreu'} · espectador
      <span className="muted"> — WASD voa · Espaço/C sobe e desce · os vivos não te ouvem</span>
    </div>
  );
}

function StatusEffects() {
  const you = useStore((s) => s.you);
  return (
    <>
      {you?.thermal && <div className="thermal-overlay" />}
      {you?.invisible && <div className="ghost-overlay" />}
      {you && you.frozen > 0 && <div className="frozen-banner">⛓ Algemado · {Math.ceil(you.frozen / 1000)}s</div>}
    </>
  );
}

function VoiceWidget({ touch }: { touch: boolean }) {
  const v = useStore((s) => s.voice);
  const ptt = useStore((s) => s.settings.pushToTalk);
  const speaking = useStore((s) => s.speaking);
  const entities = useStore((s) => s.entities);
  const set = useStore((s) => s.set);
  const myId = useStore((s) => s.role?.netId);

  const toggleMic = () => {
    set({ voice: { ...v, micOn: !v.micOn } });
    void voice.applyMic();
  };
  const names = speaking
    .filter((id) => id !== myId)
    .map((id) => {
      const e = entities.find((x) => x.id === id);
      if (e) return e.noName ? '???' : e.name;
      if (net.audioOnly.has(id)) return 'Voz no nevoeiro';
      return v.channel === 'mortos' ? voice.nameOf(id) ?? 'Espectador' : null;
    })
    .filter(Boolean) as string[];
  const label =
    v.status === 'on' ? (v.channel === 'mortos' ? 'Voz: mortos' : 'Voz: proximidade') :
    v.status === 'connecting' ? 'Voz: conectando…' :
    v.status === 'unavailable' ? 'Voz indisponível' :
    v.status === 'error' ? 'Voz: erro' : 'Voz desligada';
  return (
    <div className="voice-widget">
      <button
        className={`mic-btn${v.micOn ? '' : ' off'}${speaking.includes(myId ?? '-') ? ' talking' : ''}`}
        onClick={toggleMic}
        onPointerDown={() => touch && ptt && (set({ voice: { ...v, pttHeld: true } }), void voice.applyMic())}
        onPointerUp={() => touch && ptt && (set({ voice: { ...v, pttHeld: false } }), void voice.applyMic())}
        title={v.reason ?? label}
      >
        {v.micOn ? '🎙' : '🔇'}
      </button>
      <div className="voice-info">
        <span className="voice-label">{label}{ptt && v.status === 'on' ? ' · segure V' : ''}</span>
        {names.slice(0, 3).map((n) => (
          <span key={n} className="voice-speaker">◉ {n}</span>
        ))}
      </div>
    </div>
  );
}
