import { useEffect, useRef, useState } from 'react';
import { CONFIG, filterProfanity, type ChatChannel } from '@nevoeiro/shared';
import { sendChat, sendReport } from '../net/connection';
import { useStore } from '../net/store';
import { Icon } from './Icons';

const CHANNEL_LABEL: Record<ChatChannel, string> = {
  local: 'Perto',
  killers: 'Assassinos',
  dead: 'Mortos',
};

export function Chat({ compact }: { compact: boolean }) {
  const chat = useStore((s) => s.chat);
  const open = useStore((s) => s.chatOpen);
  const channel = useStore((s) => s.chatChannel);
  const role = useStore((s) => s.role);
  const alive = useStore((s) => s.you?.alive ?? true);
  const muted = useStore((s) => s.muted);
  const set = useStore((s) => s.set);
  const toggleMute = useStore((s) => s.toggleMute);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const channels: ChatChannel[] = alive
    ? role?.team === 'assassinos'
      ? ['local', 'killers']
      : ['local']
    : role?.team === 'assassinos'
      ? ['dead', 'killers']
      : ['dead'];

  const channelsKey = channels.join(',');
  useEffect(() => {
    if (!channelsKey.split(',').includes(channel)) set({ chatChannel: channelsKey.split(',')[0] as ChatChannel });
  }, [channelsKey, channel, set]);

  useEffect(() => {
    if (open) {
      document.exitPointerLock?.();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length, open]);

  const send = () => {
    const t = text.trim();
    if (t) sendChat(filterProfanity(t), channel);
    setText('');
    set({ chatOpen: false });
    inputRef.current?.blur();
  };

  const visible = chat.slice(open ? -40 : compact ? -4 : -7);
  return (
    <div className={`chat${open ? ' open' : ''}`}>
      <div className="chat-list" ref={listRef}>
        {visible.map((m) => (
          <div key={m.id} className={`chat-line ch-${m.channel}`}>
            {m.channel !== 'local' && <span className="ch-tag">[{CHANNEL_LABEL[m.channel]}]</span>}
            <button
              className={`chat-name${m.anonymous ? ' anon' : ''}`}
              disabled={!m.fromId}
              onClick={() => m.fromId && setMenu({ id: m.fromId, name: m.fromName })}
            >
              {m.fromName}
            </button>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {menu && (
        <div className="chat-menu">
          <strong>{menu.name}</strong>
          <button className="btn small" onClick={() => { toggleMute(menu.id); setMenu(null); }}>
            {muted.includes(menu.id) ? 'Reativar voz e texto' : 'Silenciar'}
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              sendReport(menu.id, `Denúncia via chat contra "${menu.name}"`);
              setMenu(null);
            }}
          >
            Denunciar
          </button>
          <button className="btn small ghost" onClick={() => setMenu(null)}>Fechar</button>
        </div>
      )}
      {open ? (
        <div className="chat-input">
          <select value={channel} onChange={(e) => set({ chatChannel: e.target.value as ChatChannel })}>
            {channels.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </select>
          <input
            ref={inputRef}
            autoFocus
            value={text}
            maxLength={CONFIG.chat.maxLength}
            placeholder={channel === 'local' ? `Só quem está a ${CONFIG.chat.textRadius}m lê…` : 'Mensagem…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') send();
              if (e.key === 'Escape') { setText(''); set({ chatOpen: false }); }
            }}
          />
          <button className="btn small" onClick={send}>Enviar</button>
        </div>
      ) : (
        compact && (
          <button className="btn small chat-open-btn" onClick={() => set({ chatOpen: true })}><Icon name="chat" size={16} /> Chat</button>
        )
      )}
    </div>
  );
}
