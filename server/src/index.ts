import 'dotenv/config';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@nevoeiro/shared';
import { GameRoom } from './rooms/GameRoom';
import { voiceEnabled } from './voice/livekit';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('text/plain').send('Nevoeiro — servidor de jogo no ar.');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, voice: voiceEnabled(), uptime: process.uptime() });
});

/** O cliente usa para validar o código antes de entrar. */
app.get('/rooms/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const rooms = await matchMaker.query({ name: ROOM_NAME, roomId: code });
  const room = rooms[0];
  if (!room) return res.status(404).json({ exists: false });
  res.json({ exists: true, clients: room.clients, locked: room.locked });
});

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server, pingInterval: 4000, pingMaxRetries: 3 }),
});

gameServer.define(ROOM_NAME, GameRoom);

gameServer.listen(PORT).then(() => {
  console.log(`\n  ▓ Nevoeiro — servidor em http://localhost:${PORT}`);
  console.log(`  ▓ Voz (LiveKit): ${voiceEnabled() ? 'ATIVA' : 'desativada (configure server/.env)'}\n`);
});

const shutdown = () => {
  gameServer.gracefullyShutdown().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
