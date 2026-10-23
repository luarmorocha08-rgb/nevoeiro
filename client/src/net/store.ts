import { create } from 'zustand';
import type {
  AlertMsg,
  ChatChannel,
  ChatMsg,
  EndMsg,
  ExamineMsg,
  Phase,
  RoleMsg,
  SnapshotMsg,
  ToastMsg,
  YouSnap,
} from '@nevoeiro/shared';
import { loadSettings, saveSettings, type Settings } from '../quality';

export interface LobbyPlayerView {
  id: string;
  name: string;
  skin: string;
  isBot: boolean;
  connected: boolean;
}

export interface EntityView {
  id: string;
  name: string;
  skin: string;
  ghost: boolean;
  noName: boolean;
  ally: boolean;
  role?: string;
}

export interface BodyView {
  id: string;
  name: string;
  skin: string;
  x: number;
  z: number;
  y: number;
}

export interface Toast extends ToastMsg {
  id: number;
  until: number;
}

export interface Marker {
  id: number;
  x: number;
  z: number;
  until: number;
  kind: AlertMsg['kind'];
}

export interface TargetView {
  action: string;
  id: string;
  name: string;
}

export type Screen = 'home' | 'lobby' | 'game';
export type ConnState = 'offline' | 'connecting' | 'online' | 'reconnecting';
export type VoiceStatus = 'off' | 'connecting' | 'on' | 'unavailable' | 'error';

interface State {
  screen: Screen;
  conn: ConnState;
  connError: string | null;

  sessionId: string;
  code: string;
  phase: Phase;
  hostId: string;
  testMode: boolean;
  revealEndsAt: number;
  players: LobbyPlayerView[];

  role: RoleMsg | null;
  you: YouSnap | null;
  counts: SnapshotMsg['c'] | null;
  entities: EntityView[];
  bodies: BodyView[];

  alerts: (AlertMsg & { id: number })[];
  markers: Marker[];
  chat: ChatMsg[];
  bubbles: Record<string, { text: string; until: number }>;
  toasts: Toast[];
  examine: ExamineMsg | null;
  end: EndMsg | null;

  voice: { status: VoiceStatus; channel: 'vivos' | 'mortos' | null; reason?: string; micOn: boolean; pttHeld: boolean };
  speaking: string[];

  settings: Settings;
  muted: string[];

  chatOpen: boolean;
  chatChannel: ChatChannel;
  mapOpen: boolean;
  teleportPicking: boolean;
  showRole: boolean;
  settingsOpen: boolean;
  target: TargetView | null;
  bodyTarget: TargetView | null;
  pointerLocked: boolean;
}

interface Actions {
  set: (p: Partial<State>) => void;
  pushToast: (t: ToastMsg) => void;
  pushAlert: (a: AlertMsg) => void;
  pushChat: (m: ChatMsg) => void;
  updateSettings: (p: Partial<Settings>) => void;
  toggleMute: (id: string) => void;
  resetMatch: () => void;
}

let seq = 1;

export const useStore = create<State & Actions>((set, get) => ({
  screen: 'home',
  conn: 'offline',
  connError: null,
  sessionId: '',
  code: '',
  phase: 'lobby',
  hostId: '',
  testMode: false,
  revealEndsAt: 0,
  players: [],
  role: null,
  you: null,
  counts: null,
  entities: [],
  bodies: [],
  alerts: [],
  markers: [],
  chat: [],
  bubbles: {},
  toasts: [],
  examine: null,
  end: null,
  voice: { status: 'off', channel: null, micOn: true, pttHeld: false },
  speaking: [],
  settings: loadSettings(),
  muted: [],
  chatOpen: false,
  chatChannel: 'local',
  mapOpen: false,
  teleportPicking: false,
  showRole: false,
  settingsOpen: false,
  target: null,
  bodyTarget: null,
  pointerLocked: false,

  set: (p) => set(p),

  pushToast: (t) => {
    const toast: Toast = { ...t, id: seq++, until: Date.now() + 4500 };
    set({ toasts: [...get().toasts.slice(-3), toast] });
  },

  pushAlert: (a) => {
    const id = seq++;
    const until = Date.now() + 10_000;
    set({
      alerts: [...get().alerts.slice(-4), { ...a, id }],
      markers: [...get().markers.filter((m) => m.until > Date.now()), { id, x: a.x, z: a.z, until, kind: a.kind }],
    });
  },

  pushChat: (m) => {
    const st = get();
    if (m.fromId && st.muted.includes(m.fromId)) return;
    const chat = [...st.chat, m].slice(-60);
    const bubbles = { ...st.bubbles };
    if (m.channel === 'local' && m.fromId) bubbles[m.fromId] = { text: m.text, until: Date.now() + 6000 };
    set({ chat, bubbles });
  },

  updateSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    set({ settings });
  },

  toggleMute: (id) => {
    const muted = get().muted.includes(id) ? get().muted.filter((x) => x !== id) : [...get().muted, id];
    set({ muted });
  },

  resetMatch: () =>
    set({
      role: null,
      you: null,
      counts: null,
      entities: [],
      bodies: [],
      alerts: [],
      markers: [],
      chat: [],
      bubbles: {},
      examine: null,
      end: null,
      target: null,
      bodyTarget: null,
      teleportPicking: false,
      mapOpen: false,
      chatOpen: false,
      chatChannel: 'local',
    }),
}));

export const getState = () => useStore.getState();
