import { Room, type Client } from 'colyseus';
import {
  C2S,
  CONFIG,
  S2C,
  SKINS,
  isValidSkin,
  sanitizeName,
  type ActionMsg,
  type ChatSendMsg,
  type EndMsg,
  type InputMsg,
  type LobbyUpdateMsg,
  type ReportMsg,
  type ToastMsg,
} from '@nevoeiro/shared';
import { BOT_NAMES } from '../game/Bots';
import { Match, type MatchIO } from '../game/Match';
import type { ServerPlayer } from '../game/types';
import { createVoiceToken, kickFromVoice } from '../voice/livekit';
import { GameState, LobbyPlayer } from './schema';

const usedCodes = new Set<string>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!usedCodes.has(c)) {
      usedCodes.add(c);
      return c;
    }
  }
}


interface CreateOptions {
  testMode?: boolean;
  name?: string;
  skin?: string;
}

/**
 * Sala do jogo. Cuida do lobby (código, nomes, skins, host, bots), de conexões e
 * reconexões, e delega TODAS as regras para a classe Match (servidor autoritativo).
 */
export class GameRoom extends Room<GameState> {
  maxClients: number = CONFIG.players.max;
  private match: Match | null = null;
  private clientsBySession = new Map<string, Client>();
  private voiceChannel = new Map<string, 'vivos' | 'mortos'>();

  onCreate(options: CreateOptions) {
    this.roomId = generateCode();
    this.setState(new GameState());
    this.state.code = this.roomId;
    this.state.testMode = !!options?.testMode;
    this.setPatchRate(100);
    this.setSimulationInterval((dt) => this.update(dt), 1000 / CONFIG.net.tickRate);
    this.registerMessages();
    console.log(`[sala ${this.roomId}] criada${this.state.testMode ? ' (modo de teste)' : ''}`);
  }

  onJoin(client: Client, options: CreateOptions) {
    if (this.state.phase !== 'lobby') throw new Error('A partida já começou.');
    if (this.state.players.size >= CONFIG.players.max) throw new Error('Sala cheia.');
    this.clientsBySession.set(client.sessionId, client);
    const lp = new LobbyPlayer();
    lp.id = client.sessionId;
    lp.name = sanitizeName(options?.name);
    lp.skin = isValidSkin(options?.skin) ? options.skin! : this.freeSkin();
    this.state.players.set(client.sessionId, lp);
    if (!this.state.hostId || !this.clientsBySession.has(this.state.hostId)) this.state.hostId = client.sessionId;
    this.syncLock();
  }

  async onLeave(client: Client, consented: boolean) {
    const lp = this.state.players.get(client.sessionId);
    if (!lp) return;
    const inMatch = this.state.phase !== 'lobby' && this.match;

    if (!inMatch && consented) {
      this.removeHuman(client.sessionId);
      return;
    }

    lp.connected = false;
    const sp = this.match?.bySession(client.sessionId);
    if (sp) sp.connected = false;

    // saiu de propósito no meio da partida: um bot assume o personagem na hora
    if (inMatch && consented && sp) {
      this.match!.handOverToBot(sp);
      lp.isBot = true;
      this.clientsBySession.delete(client.sessionId);
      this.reassignHost();
      return;
    }
    try {
      const seconds = inMatch ? CONFIG.match.reconnectSeconds : 20;
      const newClient = await this.allowReconnection(client, seconds);
      this.clientsBySession.set(client.sessionId, newClient);
      lp.connected = true;
      if (sp) {
        sp.connected = true;
        this.resync(newClient, sp);
      }
    } catch {
      // não voltou
      if (this.match && sp && this.state.phase !== 'lobby') {
        this.match.handOverToBot(sp);
        lp.connected = false;
        lp.isBot = true;
        this.clientsBySession.delete(client.sessionId);
        this.reassignHost();
      } else {
        this.removeHuman(client.sessionId);
      }
    }
  }

  onDispose() {
    usedCodes.delete(this.roomId);
    console.log(`[sala ${this.roomId}] encerrada`);
  }

  // ------------------------------------------------------------------ mensagens

  private registerMessages() {
    this.onMessage(C2S.lobbyUpdate, (client, msg: LobbyUpdateMsg) => {
      if (this.state.phase !== 'lobby') return;
      const lp = this.state.players.get(client.sessionId);
      if (!lp) return;
      if (msg?.name !== undefined) lp.name = sanitizeName(msg.name);
      if (isValidSkin(msg?.skin)) lp.skin = msg.skin;
    });

    this.onMessage(C2S.lobbyBots, (client, msg: { count: number }) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      const want = Math.max(0, Math.min(CONFIG.players.max, Math.floor(Number(msg?.count) || 0)));
      this.setBotCount(want);
    });

    this.onMessage(C2S.lobbyStart, (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      if (this.state.testMode) {
        const humans = this.humanCount();
        const need = Math.max(0, CONFIG.players.testModeFillTo - humans);
        if (this.botCount() < need) this.setBotCount(need);
      }
      const total = this.state.players.size;
      if (total < CONFIG.players.min && !this.state.testMode) {
        this.sendToast(client, `São necessários pelo menos ${CONFIG.players.min} jogadores (adicione bots para testar).`, 'warn');
        return;
      }
      this.startMatch();
    });

    this.onMessage(C2S.lobbyReset, (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'ended') return;
      this.match = null;
      this.voiceChannel.clear();
      this.state.phase = 'lobby';
      // jogadores que caíram durante a partida e viraram bot saem da lista
      for (const [id, lp] of this.state.players) {
        if (lp.isBot && !id.startsWith('bot-')) this.state.players.delete(id);
      }
      this.syncLock();
    });

    this.onMessage(C2S.input, (client, msg: InputMsg) => {
      const p = this.match?.bySession(client.sessionId);
      if (p) this.match!.applyInput(p, msg);
    });

    this.onMessage(C2S.action, (client, msg: ActionMsg) => {
      const p = this.match?.bySession(client.sessionId);
      if (p && msg && typeof msg.type === 'string') this.match!.handleAction(p, msg);
    });

    this.onMessage(C2S.chat, (client, msg: ChatSendMsg) => {
      const p = this.match?.bySession(client.sessionId);
      if (!p || !msg) return;
      const channel = msg.channel === 'killers' || msg.channel === 'dead' ? msg.channel : 'local';
      this.match!.chat(p, String(msg.text ?? ''), channel);
    });

    this.onMessage(C2S.voiceRequest, (client) => {
      const p = this.match?.bySession(client.sessionId);
      if (p) void this.sendVoiceToken(p);
    });

    this.onMessage(C2S.report, (client, msg: ReportMsg) => {
      const p = this.match?.bySession(client.sessionId);
      const target = msg?.targetId ? this.match?.getPlayer(msg.targetId) : undefined;
      this.match?.logEvent('report', {
        actor: p,
        target,
        reason: String(msg?.reason ?? '').slice(0, 200),
      });
      console.warn(`[sala ${this.roomId}] DENÚNCIA de ${p?.name ?? client.sessionId} contra ${target?.name ?? msg?.targetId}: ${msg?.reason}`);
      this.sendToast(client, 'Denúncia registrada. Obrigado.', 'info');
    });

    this.onMessage(C2S.sync, (client) => {
      const p = this.match?.bySession(client.sessionId);
      if (p) this.resync(client, p);
    });
  }

  // ------------------------------------------------------------------ partida

  private startMatch() {
    const participants = [...this.state.players.values()].map((lp) => ({
      sessionId: lp.isBot ? null : lp.id,
      name: lp.name,
      skin: lp.skin,
      isBot: lp.isBot,
    }));

    const io: MatchIO = {
      send: (p, type, msg) => {
        if (!p.sessionId || !p.connected) return;
        this.clientsBySession.get(p.sessionId)?.send(type, msg);
      },
      broadcast: (type, msg) => this.broadcast(type, msg),
      onVoiceChange: (p) => void this.sendVoiceToken(p),
      onPhase: (phase) => {
        this.state.phase = phase;
      },
      onEnd: (msg: EndMsg) => this.broadcast(S2C.end, msg),
    };

    this.match = new Match(io, participants, this.roomId);
    this.state.phase = 'reveal';
    this.state.revealEndsAt = this.match.revealEndsAt;
    this.lock();
    for (const p of this.match.players.values()) {
      if (!p.sessionId) continue;
      this.clientsBySession.get(p.sessionId)?.send(S2C.role, this.match.roleMessage(p));
    }
  }

  private update(dtMs: number) {
    this.match?.tick(dtMs / 1000);
  }

  private resync(client: Client, p: ServerPlayer) {
    if (!this.match) return;
    client.send(S2C.role, this.match.roleMessage(p));
    if (this.match.result) client.send(S2C.end, this.match.result);
    void this.sendVoiceToken(p);
  }

  private async sendVoiceToken(p: ServerPlayer) {
    if (!p.sessionId || !this.match) return;
    const channel = p.alive ? 'vivos' : 'mortos';
    const previous = this.voiceChannel.get(p.netId);
    if (previous && previous !== channel) void kickFromVoice(this.roomId, previous, p.netId);
    this.voiceChannel.set(p.netId, channel);
    const msg = await createVoiceToken(this.roomId, channel, p.netId, p.name);
    if (p.sessionId) this.clientsBySession.get(p.sessionId)?.send(S2C.voice, msg);
  }

  // ------------------------------------------------------------------ lobby util

  private humanCount() {
    return [...this.state.players.values()].filter((p) => !p.isBot).length;
  }
  private botCount() {
    return [...this.state.players.values()].filter((p) => p.isBot).length;
  }

  private setBotCount(want: number) {
    const max = CONFIG.players.max - this.humanCount();
    want = Math.max(0, Math.min(want, max));
    const bots = [...this.state.players.values()].filter((p) => p.isBot);
    while (bots.length > want) this.state.players.delete(bots.pop()!.id);
    const usedNames = new Set([...this.state.players.values()].map((p) => p.name));
    while (bots.length < want) {
      const lp = new LobbyPlayer();
      lp.id = `bot-${Math.random().toString(36).slice(2, 8)}`;
      lp.isBot = true;
      lp.connected = true;
      lp.name = (BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${bots.length + 1}`) + ' 🤖';
      usedNames.add(lp.name.replace(' 🤖', ''));
      lp.skin = this.freeSkin();
      this.state.players.set(lp.id, lp);
      bots.push(lp);
    }
    this.syncLock();
  }

  private freeSkin(): string {
    const used = new Set([...this.state.players.values()].map((p) => p.skin));
    const free = SKINS.filter((s) => !used.has(s.id));
    const pool = free.length ? free : SKINS;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  private removeHuman(sessionId: string) {
    this.state.players.delete(sessionId);
    this.clientsBySession.delete(sessionId);
    this.reassignHost();
    if (this.humanCount() === 0) {
      // só bots: limpa para a sala poder ser descartada
      for (const id of [...this.state.players.keys()]) this.state.players.delete(id);
    }
    this.syncLock();
  }

  private reassignHost() {
    if (this.clientsBySession.has(this.state.hostId)) return;
    const next = [...this.state.players.values()].find((p) => !p.isBot && p.connected);
    this.state.hostId = next?.id ?? '';
  }

  /** Bots ocupam vagas: ajusta o limite de clientes humanos. */
  private syncLock() {
    if (this.state.phase !== 'lobby') return;
    this.maxClients = Math.max(1, CONFIG.players.max - this.botCount());
    if (this.state.players.size >= CONFIG.players.max) void this.lock();
    else void this.unlock();
  }

  private sendToast(client: Client, text: string, level: ToastMsg['level']) {
    client.send(S2C.toast, { text, level } satisfies ToastMsg);
  }
}
