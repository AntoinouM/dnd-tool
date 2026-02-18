import WebSocket, { Server as WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

interface Room {
  presenter: WebSocket | null;
  master: WebSocket | null;
  players: PlayerData[];
}

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map<string, Room>();

function broadcast(room: Room, message: object, exclude?: WebSocket) {
  const data = JSON.stringify(message);
  if (
    room.presenter &&
    room.presenter.readyState === WebSocket.OPEN &&
    room.presenter !== exclude
  ) {
    room.presenter.send(data);
  }
  if (
    room.master &&
    room.master.readyState === WebSocket.OPEN &&
    room.master !== exclude
  ) {
    room.master.send(data);
  }
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected.');
  let currentRoom: string | null = null;
  let role: 'presenter' | 'master' | null = null;

  ws.on('message', (data: Buffer) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'create-room') {
      const roomId = uuidv4().slice(0, 6);
      rooms.set(roomId, { presenter: ws, master: null, players: [] });
      currentRoom = roomId;
      role = 'presenter';

      ws.send(JSON.stringify({ type: 'room-created', roomId }));
      console.log(`Room created: ${roomId}`);
    }

    if (msg.type === 'join-room') {
      const roomId: string = msg.roomId;
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId)!;
        room.master = ws;
        currentRoom = roomId;
        role = 'master';

        ws.send(
          JSON.stringify({
            type: 'joined-room',
            roomId,
            players: room.players,
          }),
        );

        if (room.presenter && room.presenter.readyState === WebSocket.OPEN) {
          room.presenter.send(JSON.stringify({ type: 'master-joined' }));
        }
        console.log(`Master joined room: ${roomId}`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      }
    }

    if (msg.type === 'add-player') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        const player: PlayerData = msg.player;
        room.players.push(player);
        broadcast(room, { type: 'player-added', player });
        console.log(`Player added in room ${currentRoom}: ${player.name}`);
      }
    }

    if (msg.type === 'update-player') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        const updated: PlayerData = msg.player;
        const idx = room.players.findIndex((p) => p.id === updated.id);
        if (idx !== -1) {
          room.players[idx] = updated;
        }
        broadcast(room, { type: 'player-updated', player: updated }, ws);
        console.log(`Player updated in room ${currentRoom}: ${updated.name}`);
      }
    }

    if (msg.type === 'delete-player') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.players = room.players.filter((p) => p.id !== msg.playerId);
        broadcast(room, { type: 'player-deleted', playerId: msg.playerId });
        console.log(`Player deleted in room ${currentRoom}: ${msg.playerId}`);
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom)!;
      if (role === 'presenter') {
        if (room.master && room.master.readyState === WebSocket.OPEN) {
          room.master.send(JSON.stringify({ type: 'presenter-disconnected' }));
        }
        room.presenter = null;
      } else if (role === 'master') {
        if (room.presenter && room.presenter.readyState === WebSocket.OPEN) {
          room.presenter.send(JSON.stringify({ type: 'master-disconnected' }));
        }
        room.master = null;
      }
      if (!room.presenter && !room.master) {
        rooms.delete(currentRoom);
        console.log(`Room ${currentRoom} deleted (empty).`);
      }
    }
    console.log('Client disconnected.');
  });
});

console.log('Backend running on ws://localhost:8080');
