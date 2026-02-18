import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';

interface Room {
  master?: WebSocket;
  presenters: Set<WebSocket>;
  state?: any;
}

const rooms: Record<string, Room> = {};

export function createRoom(master: WebSocket): string {
  const roomId = uuid().slice(0, 6);
  rooms[roomId] = {
    master,
    presenters: new Set(),
    state: null,
  };
  console.log('Room created:', roomId);
  return roomId;
}

export function joinRoom(roomId: string, ws: WebSocket) {
  const room = rooms[roomId];
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  room.presenters.add(ws);
  console.log(`Client joined room ${roomId}`);

  // Send current state if it exists
  if (room.state) {
    ws.send(JSON.stringify({ type: 'state-update', state: room.state }));
  }
}

export function updateRoomState(roomId: string, state: any, sender: WebSocket) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = state;

  // Broadcast to all presenters except master/sender
  for (const client of room.presenters) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'state-update', state }));
    }
  }
}
