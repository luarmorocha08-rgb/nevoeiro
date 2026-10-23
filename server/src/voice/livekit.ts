import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { VoiceTokenMsg } from '@nevoeiro/shared';

/**
 * Voz via LiveKit. Cada sala do jogo tem DOIS canais de voz:
 *  - <código>-vivos  : jogadores vivos (áudio espacial por proximidade no cliente)
 *  - <código>-mortos : espectadores — os vivos NÃO ouvem
 * O token só é emitido pelo servidor do jogo, que sabe quem está vivo.
 */
const url = () => process.env.LIVEKIT_URL ?? '';
const publicUrl = () => process.env.LIVEKIT_PUBLIC_URL || url();
const key = () => process.env.LIVEKIT_API_KEY ?? '';
const secret = () => process.env.LIVEKIT_API_SECRET ?? '';

export function voiceEnabled(): boolean {
  return Boolean(url() && key() && secret());
}

export function voiceRoomName(code: string, channel: 'vivos' | 'mortos'): string {
  return `nevoeiro-${code}-${channel}`;
}

export async function createVoiceToken(
  code: string,
  channel: 'vivos' | 'mortos',
  identity: string,
  /** só no canal dos mortos: lá o nome real pode aparecer */
  name?: string,
): Promise<VoiceTokenMsg> {
  if (!voiceEnabled()) {
    return { available: false, reason: 'Voz desativada no servidor (configure o LiveKit no .env).' };
  }
  const room = voiceRoomName(code, channel);
  const at = new AccessToken(key(), secret(), { identity, name: channel === 'mortos' ? name : undefined, ttl: '2h' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false });
  const token = await at.toJwt();
  return { available: true, url: publicUrl(), token, room, channel };
}

let service: RoomServiceClient | null = null;

/** Remove o participante do canal antigo (ex.: morreu → sai do canal dos vivos). */
export async function kickFromVoice(code: string, channel: 'vivos' | 'mortos', identity: string): Promise<void> {
  if (!voiceEnabled()) return;
  try {
    service ??= new RoomServiceClient(url().replace(/^ws/, 'http'), key(), secret());
    await service.removeParticipant(voiceRoomName(code, channel), identity);
  } catch {
    // participante já tinha saído — ok
  }
}
