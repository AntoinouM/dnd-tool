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
      <div ref="stageContainer" id="stage"></div>
    </div>

    <!-- Master view: canvas & color button -->
    <div v-if="joined && role === 'master'">
      <p>Room: {{ roomId }} (Master)</p>
      <div ref="stageContainer" id="stage"></div>
      <button @click="changeColor" style="margin-top: 10px">
        Change Square Color
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import Konva from 'konva';
import { useWs } from '../composables/useWs';

// ----- State -----
const stageContainer = ref<HTMLDivElement>();
const roomId = ref('');
const joined = ref(false);
const role = ref<'presenter' | 'master' | null>(null);
const masterConnected = ref(false);
const joinInput = ref('');

// ----- Konva elements -----
let stage: Konva.Stage;
let layer: Konva.Layer;
let square: Konva.Rect;

// ----- WebSocket -----
const WS_URL = 'ws://localhost:8080';
const { ws, connect, send, onMessage } = useWs(WS_URL);

// Initialize the stage and square
const initStage = async (color: string) => {
  await nextTick(); // wait for the DOM to update so stageContainer is available
  if (!stageContainer.value) return;

  stage = new Konva.Stage({
    container: stageContainer.value,
    width: 400,
    height: 400,
  });

  layer = new Konva.Layer();
  stage.add(layer);

  square = new Konva.Rect({
    x: 150,
    y: 150,
    width: 100,
    height: 100,
    fill: color,
  });

  layer.add(square);
  layer.draw();
};

// ----- WebSocket message handler -----
onMessage((msg: any) => {
  if (msg.type === 'room-created') {
    roomId.value = msg.roomId;
    role.value = 'presenter';
    joined.value = true;
  }

  if (msg.type === 'master-joined') {
    // Presenter receives this: master has connected, show the canvas
    masterConnected.value = true;
    initStage('#ff0000');
  }

  if (msg.type === 'joined-room') {
    roomId.value = msg.roomId;
    role.value = 'master';
    joined.value = true;
    initStage(msg.squareColor || '#ff0000');
  }

  if (msg.type === 'square-color-changed') {
    if (square) {
      square.fill(msg.color);
      layer.draw();
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

const changeColor = () => {
  const color =
    '#' +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, '0');
  send({ type: 'update-square-color', color });
};
</script>

<style scoped>
#stage {
  border: 1px solid #333;
  margin-top: 20px;
}
button {
  margin-right: 10px;
}
</style>
