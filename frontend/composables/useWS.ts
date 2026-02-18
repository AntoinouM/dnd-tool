import { ref } from 'vue';

export const useWs = (url: string) => {
  const ws = ref<WebSocket | null>(null);
  const messageCallbacks: ((msg: any) => void)[] = [];

  const connect = () => {
    ws.value = new WebSocket(url);

    ws.value.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      messageCallbacks.forEach((callback) => callback(msg));
    };
  };

  const send = (message: any) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message));
    }
  };

  const onMessage = (callback: (msg: any) => void) => {
    messageCallbacks.push(callback);
  };

  return { ws, connect, send, onMessage };
};
