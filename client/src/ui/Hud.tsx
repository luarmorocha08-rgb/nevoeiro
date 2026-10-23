import { useEffect, useRef, useState } from 'react';
import { CONFIG, ROLE_INFO } from '@nevoeiro/shared';
import { voice } from '../voice/VoiceManager';
import { net, serverNow } from '../net/netState';
import { useStore } from '../net/store';
import { isTouchDevice } from '../quality';
import { THEME, roleColor, teamColor } from '../theme';
import { AbilityBar } from './AbilityBar';
import { Chat } from './Chat';
import { EndScreen } from './EndScreen';
import { Icon } from './Icons';
import { MapOverlay, Minimap } from './Minimap';
import { RoleReveal } from './RoleReveal';
import { TouchControls } from './TouchControls';
import { Tutorial } from './Tutorial';
import { TaskGame, TaskList, TaskPrompt, VillageProgress } from './Tasks';
import { Notebook, NotebookButton } from './Notebook';
import { RoundScreen } from './RoundScreen';

export function Hud() {
  const touch = isTouchDevice();
  const phase = useStore((s) => s.phase);
  const end = useStore((s) => s.end);
  const conn = useStore((s) => s.conn);
  const alive = useStore((s) => s.you?.alive ?? true);
  const locked = useStore((s) => s.pointerLocked);
  const showFps = useStore((s) => s.settings.showFps);
  const taskOpen = useStore((s) => !!s.taskOpen);
  const compact = touch || window.innerWidth < 760;

  return (
    <div className={`hud${touch ? ' touch' : ''}`}>
      {/* primeiro filho: fica atrás do resto do HUD (não escurece botões nem textos) */}
      <TensionOverlay />
      {touch && !end && <TouchControls />}
      <TopBar />
      <Alerts />
      <Toasts />
      {!end && (
        <div className="hud-right-top">
          <Minimap size={compact ? 112 : 168} />
          <VoiceWidget touch={touch} />
          <div className="hud-btn-row">
            <NotebookButton />
          <button className="round-btn gear-btn" aria-label="Configurações" title="Configurações" onClick={() => useStore.getState().set({ settingsOpen: true })}>
            <Icon name="gear" size={20} />
          </button>
          </div>
        </div>
      )}
      {phase === 'playing' && !end && <TaskList compact={compact} />}
      {phase === 'playing' && !end && alive && <TaskPrompt touch={touch} />}
      {phase === 'playing' && !end && alive && <TaskGame touch={touch} />}
      <ExaminePanel />
      <SpectatorBanner />
      <StatusEffects />
      {!end && <Chat compact={compact} />}
      {phase === 'playing' && !end && <AbilityBar touch={touch} />}
      {phase === 'playing' && !end && alive && <StaminaBar />}
      <ActionFeedback />
      {!touch && !locked && !taskOpen && phase === 'playing' && alive && !end && (
        <div className="click-hint">Clique na tela para controlar a câmera · Esc libera o mouse</div>
      )}
      {!touch && alive && phase === 'playing' && !end && <div className="crosshair" />}
      {phase === 'playing' && !end && <Tutorial touch={touch} />}
      {showFps && <FpsCounter />}
      <Notebook />
      <MapOverlay />
      <RoundScreen />
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
  const killer = info.team === 'assassinos';
  const dead = counts?.deadInnocents ?? 0;
  const need = counts?.killsNeeded ?? role.killsNeeded;
  const color = roleColor(role.role);
  return (
    <div className="topbar">
      <button className="role-chip" onClick={() => set({ showRole: true })} title="Ver seu papel (Tab)">
        <span className="role-icon-wrap" style={{ color }}>
          <Icon name={role.role} size={20} />
        </span>
        <span className="role-name">{info.name}</span>
        {/* a cor do time de assassinos só aparece para os próprios assassinos */}
        <span className="team-tag" data-shape={killer ? '◆ ' : '● '} style={{ color: teamColor(info.team) }}>
          {killer ? 'assassino' : 'inocente'}
        </span>
      </button>
      {role.totalRounds > 1 && (
        <span className="round-chip" title="Rodada atual — os papéis mudam a cada rodada">
          Rodada {role.round}/{role.totalRounds}
        </span>
      )}
      {counts && (
        <div className="counter" title="Inocentes vivos · mortes que os assassinos precisam">
          <span className="c-alive">
            <Icon name="civil" size={14} /> {counts.aliveInnocents}/{counts.totalInnocents} inocentes vivos
          </span>
          <span className="c-goal">
            <span className="goal-bar">
              <span style={{ width: `${Math.min(100, (dead / need) * 100)}%` }} />
            </span>
            <Icon name="skull" size={13} /> {dead}/{need}
          </span>
          <VillageProgress />
        </div>
      )}
      {you?.disguise && <span className="pill morph"><Icon name="morph" size={15} /> Disfarçado de {you.disguise}</span>}
      {you?.invisible && <span className="pill ghost"><Icon name="invisible" size={15} /> Invisível</span>}
      {you?.thermal && <span className="pill thermal"><Icon name="thermal" size={15} /> Visão térmica</span>}
      {you?.hidden && <span className="pill hidden"><Icon name="hide" size={15} /> Escondido · {you.hidden}</span>}
      {you?.zombie === 'voltando' && <span className="pill zombie"><Icon name="zumbi" size={15} /> Voltando em {Math.ceil((you.zombieReturnIn ?? 0) / 1000)}s</span>}
      {you?.zombie === 'retornou' && <span className="pill zombie"><Icon name="zumbi" size={15} /> Morto-vivo · 1 morte</span>}
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
  // `at` vem do relógio do servidor: compara com o relógio do servidor estimado
  const now = serverNow();
  const visible = alerts.filter((a) => now - a.at < CONFIG.alerts.toastSeconds * 1000);
  return (
    <div className="alerts" role="status" aria-live="polite">
      {visible.map((a) => (
        <div key={a.id} className={`alert ${a.kind}`}>
          <Icon name={a.kind === 'revive' ? 'star' : a.kind === 'arrest' ? 'chain' : 'skull'} size={17} color={a.kind === 'revive' ? THEME.alert.revive : undefined} />
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
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>{t.text}</div>
      ))}
    </div>
  );
}

/** Texto curto confirmando a ação (com a cor do papel). */
function ActionFeedback() {
  const fb = useStore((s) => s.feedback);
  const role = useStore((s) => s.role?.role);
  if (!fb || Date.now() - fb.at > 1500) return null;
  return (
    <div key={fb.at} className="feedback" style={{ color: roleColor(role) }}>
      <Icon name={fb.action} size={18} /> {fb.text}
    </div>
  );
}

/**
 * Vinheta vermelha que pulsa com o coração quando a tensão sobe (assassino perto ou morte
 * recente — só inocentes vivos). Feita em CSS: funciona em qualquer qualidade gráfica.
 */
function TensionOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const t = net.feel.tension;
      const beat = Math.exp(-(performance.now() - net.feel.beatAt) / 260);
      const v = t < 0.05 ? 0 : Math.min(0.9, t * (0.45 + beat * 0.55));
      el.style.opacity = v.toFixed(3);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="tension-overlay" aria-hidden />;
}

function StaminaBar() {
  const you = useStore((s) => s.you);
  if (!you) return null;
  const pct = (you.stamina / CONFIG.move.stamina.max) * 100;
  return (
    <div className={`stamina${you.exhausted ? ' exhausted' : ''}${pct >= 99.5 ? ' full' : ''}`} role="meter" aria-label="Stamina" aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
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
      <p className="eyebrow" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon name="examine" size={14} color={THEME.role.detetive} /> Exame do corpo
      </p>
      <h3>{ex.victimName}</h3>
      <p>Morreu há <strong>{m > 0 ? `${m}min ${s}s` : `${s}s`}</strong> — {ex.location}</p>
      <p>Causa: <strong className="killer-type">{ex.killer}</strong></p>
      <button className="btn small" onClick={() => set({ examine: null })}>Fechar</button>
    </div>
  );
}

function SpectatorBanner() {
  const you = useStore((s) => s.you);
  const end = useStore((s) => s.end);
  if (!you || you.alive || end) return null;
  return (
    <div className="spectator-banner glass">
      {you.arrested ? '⛓ Você foi preso' : you.zombie === 'voltando' ? '⚰ Sob a terra…' : '✝ Você morreu'} · espectador
      <span className="muted"> — WASD voa · Espaço/C sobe e desce · os vivos não te ouvem</span>
    </div>
  );
}

function StatusEffects() {
  const you = useStore((s) => s.you);
  return (
    <>
      {you?.invisible && <div className="ghost-overlay" />}
      {you?.hidden && <div className="hidden-overlay" />}
      {you && you.frozen > 0 && <div className="frozen-banner">⛓ Algemado · {Math.ceil(you.frozen / 1000)}s</div>}
    </>
  );
}

function FpsCounter() {
  const fps = useStore((s) => s.fps);
  const q = useStore((s) => s.settings.quality);
  const auto = useStore((s) => s.autoQuality);
  return <div className="fps">{fps} FPS · {q === 'auto' ? `auto (${auto ?? 'medindo'})` : q}</div>;
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
        aria-label={v.micOn ? 'Mutar microfone' : 'Ativar microfone'}
      >
        <Icon name={v.micOn ? 'mic' : 'micOff'} size={20} />
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
