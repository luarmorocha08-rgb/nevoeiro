import { useEffect, useRef } from 'react';
import { LOCATIONS, MAP_BLOCKS, WORLD } from '@nevoeiro/shared';
import { confirmTeleport } from '../game/abilities';
import { net } from '../net/netState';
import { getState, useStore } from '../net/store';

const W = WORLD.half;

/** Desenha o mapa estático uma vez (camada de fundo). */
function drawBase(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / (W * 2);
  const tx = (x: number) => (x + W) * s;
  ctx.fillStyle = '#0c1213';
  ctx.fillRect(0, 0, size, size);
  for (const l of LOCATIONS) {
    ctx.fillStyle = l.color + '88';
    ctx.fillRect(tx(l.minX), tx(l.minZ), (l.maxX - l.minX) * s, (l.maxZ - l.minZ) * s);
  }
  for (const b of MAP_BLOCKS) {
    if (b.kind === 'building') {
      ctx.fillStyle = '#6d6a66';
      ctx.fillRect(tx(b.x - b.w / 2), tx(b.z - b.d / 2), b.w * s, b.d * s);
    } else if (b.kind === 'tree') {
      ctx.fillStyle = '#1d3a26';
      ctx.beginPath();
      ctx.arc(tx(b.x), tx(b.z), Math.max(1, 1.6 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (size > 200) {
    ctx.font = `${Math.round(size / 42)}px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d9d2c3';
    for (const l of LOCATIONS) ctx.fillText(l.name, tx((l.minX + l.maxX) / 2), tx((l.minZ + l.maxZ) / 2));
  }
}

function MapCanvas({ size, interactive }: { size: number; interactive: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const picking = useStore((s) => s.teleportPicking);

  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    const b = document.createElement('canvas');
    b.width = b.height = px;
    drawBase(b.getContext('2d')!, px);
    base.current = b;
    const c = canvas.current!;
    c.width = c.height = px;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66) return;
      last = t;
      const s = px / (W * 2);
      const tx = (x: number) => (x + W) * s;
      ctx.drawImage(base.current!, 0, 0);
      // marcadores de morte (10s)
      const now = Date.now();
      for (const m of getState().markers) {
        if (m.until < now) continue;
        const pulse = 0.5 + Math.sin(t / 140) * 0.5;
        ctx.strokeStyle = m.kind === 'revive' ? '#f4e9c8' : '#ff3b3b';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(tx(m.x), tx(m.z), (5 + pulse * 5) * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = m.kind === 'revive' ? '#f4e9c8' : '#ff3b3b';
        ctx.font = `${12 * dpr}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.kind === 'revive' ? '✦' : '✝', tx(m.x), tx(m.z));
      }
      // você
      const you = getState().you;
      const x = tx(net.local.x);
      const z = tx(net.local.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-net.cameraYaw);
      ctx.fillStyle = you?.alive === false ? '#9aa7ad' : '#4fe3d4';
      ctx.beginPath();
      ctx.moveTo(0, 7 * dpr);
      ctx.lineTo(-5 * dpr, -5 * dpr);
      ctx.lineTo(5 * dpr, -5 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvas}
      className={`map-canvas${interactive && picking ? ' picking' : ''}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        if (!interactive || !getState().teleportPicking) return;
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W * 2 - W;
        const z = ((e.clientY - r.top) / r.height) * W * 2 - W;
        confirmTeleport(x, z);
      }}
    />
  );
}

export function Minimap({ size }: { size: number }) {
  const set = useStore((s) => s.set);
  return (
    <button className="minimap" onClick={() => set({ mapOpen: true })} title="Mapa (M)">
      <MapCanvas size={size} interactive={false} />
    </button>
  );
}

export function MapOverlay() {
  const open = useStore((s) => s.mapOpen);
  const picking = useStore((s) => s.teleportPicking);
  const set = useStore((s) => s.set);
  if (!open) return null;
  const size = Math.min(window.innerWidth - 32, window.innerHeight - 140, 640);
  return (
    <div className="overlay map-overlay" onClick={(e) => e.target === e.currentTarget && set({ mapOpen: false, teleportPicking: false })}>
      <div className="map-frame">
        <div className="map-title">
          {picking ? '🌀 Escolha o ponto para se teleportar' : '◇ Mapa da vila'}
        </div>
        <MapCanvas size={size} interactive />
        <button className="btn small" onClick={() => set({ mapOpen: false, teleportPicking: false })}>
          {picking ? 'Cancelar' : 'Fechar'}
        </button>
      </div>
    </div>
  );
}
