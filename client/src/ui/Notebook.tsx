/**
 * Caderno de pistas: painel lateral que não pausa o jogo (você continua vendo a cena).
 * Abas: Pistas (automáticas + suas anotações) e Pessoas (marque suspeito/confiável).
 */
import { useEffect, useRef, useState } from 'react';
import { getSkin } from '@nevoeiro/shared';
import { addClue, clock, cycleMark, type Clue } from '../game/clues';
import { useStore } from '../net/store';
import { THEME } from '../theme';
import { Icon } from './Icons';

const KIND_ICON: Record<Clue['kind'], string> = {
  death: 'skull',
  revive: 'star',
  arrest: 'chain',
  examine: 'examine',
  bell: 'bell',
  lamp: 'lamp',
  note: 'papers',
};

/** Botão do caderno no HUD (com contador de pistas novas). */
export function NotebookButton() {
  const unread = useStore((s) => s.cluesUnread);
  const set = useStore((s) => s.set);
  return (
    <button className="round-btn notebook-btn" aria-label="Caderno de pistas (J)" title="Caderno de pistas (J)" onClick={() => set({ notebookOpen: true, cluesUnread: 0 })}>
      <Icon name="papers" size={20} />
      {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

export function Notebook() {
  const open = useStore((s) => s.notebookOpen);
  const clues = useStore((s) => s.clues);
  const people = useStore((s) => s.people);
  const marks = useStore((s) => s.marks);
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<'pistas' | 'pessoas'>('pistas');
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) set({ cluesUnread: 0 });
  }, [open, set]);
  if (!open) return null;
  const close = () => set({ notebookOpen: false });
  const names = Object.keys(people).sort((a, b) => a.localeCompare(b));
  return (
    <aside className="notebook glass" aria-label="Caderno de pistas">
      <header>
        <h3><Icon name="papers" size={18} /> Caderno de pistas</h3>
        <button className="round-btn" aria-label="Fechar caderno" onClick={close}>✕</button>
      </header>
      <div className="nb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pistas'} className={tab === 'pistas' ? 'on' : ''} onClick={() => setTab('pistas')}>Pistas ({clues.length})</button>
        <button role="tab" aria-selected={tab === 'pessoas'} className={tab === 'pessoas' ? 'on' : ''} onClick={() => setTab('pessoas')}>Pessoas ({names.length})</button>
      </div>
      {tab === 'pistas' ? (
        <>
          <form
            className="nb-note"
            onSubmit={(e) => {
              e.preventDefault();
              const t = note.trim().slice(0, 140);
              if (!t) return;
              addClue('note', t);
              set({ cluesUnread: 0 });
              setNote('');
            }}
          >
            <input
              ref={input}
              value={note}
              maxLength={140}
              placeholder="Anotar (ex.: Clara saiu correndo do celeiro)"
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn small" type="submit">Anotar</button>
          </form>
          <ol className="nb-list">
            {clues.length === 0 && <li className="nb-empty">Nada ainda. Mortes, exames, o sino e os lampiões aparecem aqui com a hora e quem estava por perto.</li>}
            {[...clues].reverse().map((c) => (
              <li key={c.id} className={`nb-item ${c.kind}`}>
                <span className="nb-time">{clock(c.t)}</span>
                <Icon name={KIND_ICON[c.kind]} size={15} />
                <div>
                  <p>{c.text}</p>
                  {c.near && (
                    <p className="nb-near">
                      Perto: {c.near.map((n, i) => (
                        <span key={i} className={`nb-name ${marks[n] ?? ''}`}>{n}</span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <ul className="nb-people">
          {names.length === 0 && <li className="nb-empty">Ninguém visto ainda.</li>}
          {names.map((n) => {
            const m = marks[n];
            return (
              <li key={n}>
                <span className="nb-swatch" style={{ background: getSkin(people[n]).top }} aria-hidden />
                <span className="nb-person">{n}</span>
                <button className={`nb-mark ${m ?? ''}`} onClick={() => cycleMark(n)} aria-label={`Marca de ${n}: ${m ?? 'nenhuma'}`}>
                  {m === 'suspeito' ? '⚠ Suspeito' : m === 'confiavel' ? '✓ Confiável' : '? Sem marca'}
                </button>
              </li>
            );
          })}
          <li className="nb-hint" style={{ color: THEME.textMuted }}>As marcas são só suas e aparecem sobre a cabeça das pessoas.</li>
        </ul>
      )}
    </aside>
  );
}
