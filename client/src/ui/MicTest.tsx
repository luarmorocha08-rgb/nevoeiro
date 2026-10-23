import { useEffect, useRef, useState } from 'react';

/** Teste de microfone do lobby: mostra o nível de entrada. */
export function MicTest() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const data = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / data.length);
          if (bar.current) bar.current.style.width = `${Math.min(100, rms * 400)}%`;
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setError('Microfone bloqueado ou indisponível.');
        setOn(false);
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [on]);

  return (
    <div className="mic-test">
      <button className="btn small" onClick={() => { setError(null); setOn(!on); }}>
        {on ? '■ Parar teste' : '🎙 Testar microfone'}
      </button>
      <div className="meter">
        <div ref={bar} className="meter-fill" />
      </div>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
