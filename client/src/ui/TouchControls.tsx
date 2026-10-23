import { useRef, useState } from 'react';
import { input } from '../input/InputManager';
import { useStore } from '../net/store';

/** Joystick virtual (esquerda) + arrastar para olhar (direita). */
export function TouchControls() {
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const runToggle = useRef(false);
  const [running, setRunning] = useState(false);
  const set = useStore((s) => s.set);
  const R = 56;

  const onDown = (e: React.PointerEvent) => {
    const left = e.clientX < window.innerWidth * 0.45;
    if (left && stickId.current === null) {
      stickId.current = e.pointerId;
      setStick({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
    } else if (!left && lookId.current === null) {
      lookId.current = e.pointerId;
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId === stickId.current && stick) {
      let dx = e.clientX - stick.ox;
      let dy = e.clientY - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      setStick({ ...stick, x: dx, y: dy });
      input.touchMove = { x: dx / R, y: -dy / R };
    } else if (e.pointerId === lookId.current) {
      input.addLook((e.clientX - lookLast.current.x) * 1.6, (e.clientY - lookLast.current.y) * 1.6);
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerId === stickId.current) {
      stickId.current = null;
      setStick(null);
      input.touchMove = { x: 0, y: 0 };
    }
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  return (
    <>
      <div className="touch-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {stick && (
          <div className="stick-base" style={{ left: stick.ox - R, top: stick.oy - R, width: R * 2, height: R * 2 }}>
            <div className="stick-knob" style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
          </div>
        )}
        {!stick && <div className="stick-hint">Arraste para andar</div>}
      </div>
      <div className="touch-buttons">
        <button
          className={`round-btn${running ? ' on' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            runToggle.current = !runToggle.current;
            input.runToggle = runToggle.current;
            setRunning(runToggle.current);
          }}
        >
          🏃
        </button>
        <button className="round-btn" onPointerDown={(e) => { e.stopPropagation(); set({ mapOpen: true }); }}>🗺</button>
      </div>
    </>
  );
}
