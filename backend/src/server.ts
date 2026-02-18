import WebSocket, { Server as WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Room {
  presenter: WebSocket | null;
  master: WebSocket | null;
  color: string;
}

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map<string, Room>();

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected.');
  let currentRoom: string | null = null;
  let role: 'presenter' | 'master' | null = null;

  ws.on('message', (data: Buffer) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'create-room') {
      const roomId = uuidv4().slice(0, 6);
      rooms.set(roomId, { presenter: ws, master: null, color: '#ff0000' });
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
            squareColor: room.color,
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

    if (msg.type === 'update-square-color') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.color = msg.color;

        if (room.presenter && room.presenter.readyState === WebSocket.OPEN) {
          room.presenter.send(
            JSON.stringify({ type: 'square-color-changed', color: msg.color }),
          );
        }
        if (room.master && room.master.readyState === WebSocket.OPEN) {
          room.master.send(
            JSON.stringify({ type: 'square-color-changed', color: msg.color }),
          );
        }
        console.log(`Color updated in room ${currentRoom}: ${msg.color}`);
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom)!;
      if (role === 'presenter') {
        room.presenter = null;
      } else if (role === 'master') {
        room.master = null;
      }
      if (!room.presenter && !room.master) {
        rooms.delete(currentRoom);
      }
    }
    console.log('Client disconnected.');
  });
});

console.log('Backend running on ws://localhost:8080');
