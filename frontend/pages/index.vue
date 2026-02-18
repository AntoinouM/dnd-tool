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
          <div ref="presenterStageContainer"></div>
        </div>
      </ClientOnly>
    </div>

    <!-- Master view: canvas & controls -->
    <div v-if="joined && role === 'master'">
      <p>Room: {{ roomId }} (Master)</p>

      <div style="margin-bottom: 10px">
        <button @click="addPlayer">Add a Player</button>

        <button
          @click="toggleMode"
          :style="{
            marginLeft: '10px',
            background: currentMode === 'reveal' ? '#e74c3c' : '#3498db',
            color: 'white',
            border: 'none',
            padding: '5px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
          }"
        >
          {{ currentMode === 'move' ? '🌫️ Reveal Fog' : '🖱️ Move Mode' }}
        </button>

        <template v-if="selectedId && currentMode === 'move'">
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
          <div ref="masterStageContainer"></div>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import Konva from 'konva';
import { useWs } from '../composables/useWs';
import { useFog } from '../composables/useFog';
import { Player } from '../models/Player';

// ----- State -----
const roomId = ref('');
const joined = ref(false);
const role = ref<'presenter' | 'master' | null>(null);
const masterConnected = ref(false);
const joinInput = ref('');
const selectedId = ref<string | null>(null);
const currentMode = ref<'move' | 'reveal'>('move');
let playerCounter = 0;

const masterStageContainer = ref<HTMLDivElement>();
const presenterStageContainer = ref<HTMLDivElement>();

const stageSize = { width: 600, height: 400 };

// ----- Players -----
const players = ref<
  { id: string; name: string; x: number; y: number; color: string }[]
>([]);

const selectedPlayer = computed(
  () => players.value.find((p) => p.id === selectedId.value) || null,
);

// ----- Konva -----
let stage: Konva.Stage;
let playerLayer: Konva.Layer;
let playerNodes = new Map<
  string,
  { circle: Konva.Circle; label: Konva.Text }
>();

// ----- Fog -----
const fog = useFog({
  width: stageSize.width,
  height: stageSize.height,
  onReveal: (points) => {
    console.log('Fog reveal, sending points:', points.length);
    send({ type: 'fog-reveal', points });
    // Save snapshot periodically
    const snapshot = fog.getSnapshotData();
    send({ type: 'fog-snapshot', data: snapshot });
  },
});

// Fog for presenter (non-interactive)
const presenterFog = useFog({
  width: stageSize.width,
  height: stageSize.height,
});

// ----- WebSocket -----
const WS_URL = 'ws://localhost:8080';
const { ws, connect, send, onMessage } = useWs(WS_URL);

// ----- Konva helpers -----
const createPlayerNode = (
  p: { id: string; name: string; x: number; y: number; color: string },
  interactive: boolean,
) => {
  const circle = new Konva.Circle({
    x: p.x,
    y: p.y,
    radius: 25,
    fill: p.color,
    stroke: '#333',
    strokeWidth: 1,
    draggable: interactive && currentMode.value === 'move',
  });

  const label = new Konva.Text({
    x: p.x - 30,
    y: p.y + 30,
    text: p.name,
    fontSize: 12,
    fill: '#333',
    width: 60,
    align: 'center',
    listening: false,
  });

  if (interactive) {
    circle.on('click tap', () => {
      if (currentMode.value === 'move') {
        onPlayerClick(p.id);
      }
    });

    circle.on('dragend', () => {
      const idx = players.value.findIndex((pl) => pl.id === p.id);
      if (idx !== -1) {
        const updated = [...players.value];
        updated[idx] = { ...updated[idx], x: circle.x(), y: circle.y() };
        players.value = updated;
        label.x(circle.x() - 30);
        label.y(circle.y() + 30);
        send({ type: 'update-player', player: updated[idx] });
      }
    });

    circle.on('dragmove', () => {
      label.x(circle.x() - 30);
      label.y(circle.y() + 30);
      playerLayer.batchDraw();
    });

    circle.on('mouseenter', () => {
      if (currentMode.value === 'move') {
        document.body.style.cursor = 'pointer';
      }
    });
    circle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
    });
  }

  playerLayer.add(circle);
  playerLayer.add(label);
  playerNodes.set(p.id, { circle, label });
  playerLayer.batchDraw();
};

const removePlayerNode = (id: string) => {
  const node = playerNodes.get(id);
  if (node) {
    node.circle.destroy();
    node.label.destroy();
    playerNodes.delete(id);
    playerLayer.batchDraw();
  }
};

const updatePlayerNode = (p: {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}) => {
  const node = playerNodes.get(p.id);
  if (node) {
    node.circle.x(p.x);
    node.circle.y(p.y);
    node.circle.fill(p.color);
    node.label.x(p.x - 30);
    node.label.y(p.y + 30);
    node.label.text(p.name);
    playerLayer.batchDraw();
  }
};

const updateSelection = () => {
  playerNodes.forEach((node, id) => {
    if (id === selectedId.value) {
      node.circle.stroke('#0096FF');
      node.circle.strokeWidth(3);
    } else {
      node.circle.stroke('#333');
      node.circle.strokeWidth(1);
    }
  });
  playerLayer.batchDraw();
};

const initStage = async (
  container: HTMLDivElement,
  interactive: boolean,
  fogSnapshot?: string | null,
) => {
  await nextTick();

  stage = new Konva.Stage({
    container,
    width: stageSize.width,
    height: stageSize.height,
  });

  playerLayer = new Konva.Layer();
  stage.add(playerLayer);

  // Add existing players
  players.value.forEach((p) => createPlayerNode(p, interactive));

  // Init fog on top
  if (interactive) {
    fog.init(stage, true);
  } else {
    presenterFog.init(stage, false);
    if (fogSnapshot) {
      await presenterFog.loadSnapshot(fogSnapshot);
    }
  }

  // Stage click to deselect
  if (interactive) {
    stage.on('click tap', (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === stage) {
        selectedId.value = null;
        updateSelection();
      }
    });
  }
};

// ----- Mode toggle -----
const toggleMode = () => {
  currentMode.value = currentMode.value === 'move' ? 'reveal' : 'move';
};

watch(currentMode, (mode) => {
  // Update all player circles' draggable state
  playerNodes.forEach((node) => {
    node.circle.draggable(mode === 'move');
  });

  // Toggle fog interactivity
  fog.setInteractive(mode === 'reveal');

  // Also need to move fog layer to top when revealing, players to top when moving
  if (stage) {
    stage.container().style.cursor =
      mode === 'reveal' ? 'crosshair' : 'default';
  }

  // Deselect when switching to reveal
  if (mode === 'reveal') {
    selectedId.value = null;
    updateSelection();
  }
});

// ----- WebSocket message handler -----
onMessage((msg: any) => {
  console.log(`[${role.value}] Received:`, msg.type);

  if (msg.type === 'room-created') {
    roomId.value = msg.roomId;
    role.value = 'presenter';
    joined.value = true;
  }

  if (msg.type === 'master-joined') {
    masterConnected.value = true;
    nextTick(() => {
      if (presenterStageContainer.value) {
        initStage(presenterStageContainer.value, false);
      }
    });
  }

  if (msg.type === 'joined-room') {
    roomId.value = msg.roomId;
    role.value = 'master';
    joined.value = true;
    if (msg.players) {
      players.value = [...msg.players];
    }
    nextTick(() => {
      if (masterStageContainer.value) {
        initStage(masterStageContainer.value, true, msg.fogSnapshot);
      }
    });
  }

  if (msg.type === 'player-added') {
    if (!players.value.find((p) => p.id === msg.player.id)) {
      players.value = [...players.value, msg.player];
      if (playerLayer) {
        createPlayerNode(msg.player, role.value === 'master');
      }
    }
  }

  if (msg.type === 'player-updated') {
    const idx = players.value.findIndex((p) => p.id === msg.player.id);
    if (idx !== -1) {
      const updated = [...players.value];
      updated[idx] = msg.player;
      players.value = updated;
      updatePlayerNode(msg.player);
    }
  }

  if (msg.type === 'player-deleted') {
    players.value = players.value.filter((p) => p.id !== msg.playerId);
    removePlayerNode(msg.playerId);
    if (selectedId.value === msg.playerId) {
      selectedId.value = null;
    }
  }

  if (msg.type === 'fog-reveal') {
    console.log('Presenter received fog-reveal:', msg.points.length, 'points');
    if (role.value === 'presenter') {
      presenterFog.applyRevealPoints(msg.points);
    }
  }
});

// ----- Button actions -----
const createRoom = async () => {
  await connect();
  send({ type: 'create-room' });
};

const joinRoom = async () => {
  if (!joinInput.value) return alert('Enter a room code');
  await connect();
  send({ type: 'join-room', roomId: joinInput.value });
};

const addPlayer = () => {
  playerCounter++;
  const player = new Player(
    `Player ${playerCounter}`,
    50 + playerCounter * 60,
    200,
  );
  const config = player.toConfig();
  players.value = [...players.value, config];
  if (playerLayer) {
    createPlayerNode(config, true);
  }
  send({ type: 'add-player', player: config });
};

const deletePlayer = () => {
  if (!selectedId.value) return;
  removePlayerNode(selectedId.value);
  send({ type: 'delete-player', playerId: selectedId.value });
  players.value = players.value.filter((p) => p.id !== selectedId.value);
  selectedId.value = null;
};

const changePlayerColor = (event: Event) => {
  if (!selectedId.value) return;
  const color = (event.target as HTMLInputElement).value;
  const idx = players.value.findIndex((p) => p.id === selectedId.value);
  if (idx !== -1) {
    const updated = [...players.value];
    updated[idx] = { ...updated[idx], color };
    players.value = updated;
    updatePlayerNode(updated[idx]);
    send({ type: 'update-player', player: updated[idx] });
  }
};

const onPlayerClick = (id: string) => {
  selectedId.value = selectedId.value === id ? null : id;
  updateSelection();
};
</script>

<style scoped>
button {
  margin-right: 10px;
}
</style>
