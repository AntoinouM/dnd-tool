<template>
  <div style="padding: 20px">
    <!-- Buttons before joining a room -->
    <div v-if="!joined" style="margin-bottom: 20px">
      <button @click="createRoom">Create Room</button>
      <input v-model="joinInput" placeholder="Room code" />
      <button @click="joinRoom">Join as Master</button>
    </div>

    <!-- Presenter view: waiting for master -->
    <div
      v-if="joined && role === 'presenter' && !masterConnected"
      style="text-align: center; margin-top: 50px"
    >
      <p>Room: {{ roomId }} (Presenter)</p>
      <p style="font-size: 18px; margin-top: 20px">⏳ Waiting for master...</p>
    </div>

    <!-- Presenter view: master connected, show canvas -->
    <div v-if="joined && role === 'presenter' && masterConnected">
      <p>Room: {{ roomId }} (Presenter)</p>
      <ClientOnly>
        <div
          style="
            border: 1px solid #333;
            margin-top: 20px;
            display: inline-block;
          "
        >
          <v-stage :config="stageSize">
            <v-layer>
              <v-circle
                v-for="p in players"
                :key="p.id"
                :config="{
                  x: p.x,
                  y: p.y,
                  radius: 25,
                  fill: p.color,
                  stroke: '#333',
                  strokeWidth: 1,
                }"
              />
              <v-text
                v-for="p in players"
                :key="'label-' + p.id"
                :config="{
                  x: p.x - 30,
                  y: p.y + 30,
                  text: p.name,
                  fontSize: 12,
                  fill: '#333',
                  width: 60,
                  align: 'center',
                }"
              />
            </v-layer>
          </v-stage>
        </div>
      </ClientOnly>
    </div>

    <!-- Master view: canvas & controls -->
    <div v-if="joined && role === 'master'">
      <p>Room: {{ roomId }} (Master)</p>

      <div style="margin-bottom: 10px">
        <button @click="addPlayer">Add a Player</button>
        <template v-if="selectedId">
          <label style="margin-left: 10px">
            Color:
            <input
              type="color"
              :value="selectedPlayer?.color || '#ff0000'"
              @input="changePlayerColor($event)"
            />
          </label>
          <button @click="deletePlayer" style="margin-left: 10px; color: red">
            Delete Player
          </button>
        </template>
      </div>

      <ClientOnly>
        <div
          style="
            border: 1px solid #333;
            margin-top: 20px;
            display: inline-block;
          "
        >
          <v-stage :config="stageSize" @click="onStageClick">
            <v-layer>
              <v-circle
                v-for="p in players"
                :key="p.id"
                :config="{
                  x: p.x,
                  y: p.y,
                  radius: 25,
                  fill: p.color,
                  stroke: selectedId === p.id ? '#0096FF' : '#333',
                  strokeWidth: selectedId === p.id ? 3 : 1,
                  draggable: true,
                }"
                @dragend="onDragEnd(p.id, $event)"
                @click="onPlayerClick(p.id)"
                @mouseenter="handleMouseEnter"
                @mouseleave="handleMouseLeave"
              />
              <v-text
                v-for="p in players"
                :key="'label-' + p.id"
                :config="{
                  x: p.x - 30,
                  y: p.y + 30,
                  text: p.name,
                  fontSize: 12,
                  fill: '#333',
                  width: 60,
                  align: 'center',
                }"
              />
            </v-layer>
          </v-stage>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWs } from '../composables/useWs';
import { Player } from '../models/Player';

// ----- State -----
const roomId = ref('');
const joined = ref(false);
const role = ref<'presenter' | 'master' | null>(null);
const masterConnected = ref(false);
const joinInput = ref('');
const selectedId = ref<string | null>(null);
let playerCounter = 0;

const stageSize = {
  width: 600,
  height: 400,
};

// ----- Players -----
const players = ref<
  { id: string; name: string; x: number; y: number; color: string }[]
>([]);

const selectedPlayer = computed(
  () => players.value.find((p) => p.id === selectedId.value) || null,
);

// ----- WebSocket -----
const WS_URL = 'ws://localhost:8080';
const { ws, connect, send, onMessage } = useWs(WS_URL);

// ----- WebSocket message handler -----
onMessage((msg: any) => {
  console.log(`[${role.value}] Received:`, msg.type, JSON.stringify(msg));
  if (msg.type === 'room-created') {
    roomId.value = msg.roomId;
    role.value = 'presenter';
    joined.value = true;
  }

  if (msg.type === 'master-joined') {
    masterConnected.value = true;
  }

  if (msg.type === 'joined-room') {
    roomId.value = msg.roomId;
    role.value = 'master';
    joined.value = true;
    if (msg.players) {
      players.value = [...msg.players];
    }
  }

  if (msg.type === 'player-added') {
    if (!players.value.find((p) => p.id === msg.player.id)) {
      players.value = [...players.value, msg.player];
    }
  }

  if (msg.type === 'player-updated') {
    const idx = players.value.findIndex((p) => p.id === msg.player.id);
    if (idx !== -1) {
      const updated = [...players.value];
      updated[idx] = msg.player;
      players.value = updated;
    }
  }

  if (msg.type === 'player-deleted') {
    players.value = players.value.filter((p) => p.id !== msg.playerId);
    if (selectedId.value === msg.playerId) {
      selectedId.value = null;
    }
  }
});

// ----- Button actions -----
const createRoom = () => {
  connect();
  ws.value!.onopen = () => send({ type: 'create-room' });
};

const joinRoom = () => {
  if (!joinInput.value) return alert('Enter a room code');
  connect();
  ws.value!.onopen = () => send({ type: 'join-room', roomId: joinInput.value });
};

const addPlayer = () => {
  playerCounter++;
  const player = new Player(
    `Player ${playerCounter}`,
    50 + playerCounter * 60,
    200,
  );
  const config = player.toConfig();
  players.value.push(config);
  send({ type: 'add-player', player: config });
};

const deletePlayer = () => {
  if (!selectedId.value) return;
  send({ type: 'delete-player', playerId: selectedId.value });
  players.value = players.value.filter((p) => p.id !== selectedId.value);
  selectedId.value = null;
};

const changePlayerColor = (event: Event) => {
  if (!selectedId.value) return;
  const color = (event.target as HTMLInputElement).value;
  const idx = players.value.findIndex((p) => p.id === selectedId.value);
  if (idx !== -1) {
    players.value[idx] = { ...players.value[idx], color };
    send({ type: 'update-player', player: players.value[idx] });
  }
};

const onDragEnd = (id: string, event: any) => {
  const node = event.target;
  const idx = players.value.findIndex((p) => p.id === id);
  if (idx !== -1) {
    players.value[idx] = {
      ...players.value[idx],
      x: node.x(),
      y: node.y(),
    };
    send({ type: 'update-player', player: players.value[idx] });
  }
};

const onPlayerClick = (id: string) => {
  selectedId.value = selectedId.value === id ? null : id;
};

const onStageClick = (event: any) => {
  const clickedOnEmpty = event.target === event.target.getStage();
  if (clickedOnEmpty) {
    selectedId.value = null;
  }
};

const handleMouseEnter = () => {
  document.body.style.cursor = 'pointer';
};

const handleMouseLeave = () => {
  document.body.style.cursor = 'default';
};
</script>

<style scoped>
button {
  margin-right: 10px;
}
</style>
