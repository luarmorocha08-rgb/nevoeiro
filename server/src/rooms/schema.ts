import { MapSchema, Schema, type } from '@colyseus/schema';

/**
 * Estado PÚBLICO sincronizado automaticamente (só informações de lobby).
 * Nada que revele papel, posição ou vida vai aqui — isso segue em snapshots filtrados.
 */
export class LobbyPlayer extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') skin = '';
  @type('boolean') isBot = false;
  @type('boolean') connected = true;
}

export class GameState extends Schema {
  @type('string') phase = 'lobby';
  @type('string') code = '';
  @type('string') hostId = '';
  @type('boolean') testMode = false;
  @type('number') revealEndsAt = 0;
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}
