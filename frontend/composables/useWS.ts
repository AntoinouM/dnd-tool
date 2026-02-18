import { ref } from 'vue';

export const useWs = (url: string) => {
  const ws = ref<WebSocket | null>(null);
  const messageCallbacks: ((msg: any) => void)[] = [];

  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);

      socket.onopen = () => {
        resolve();
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        messageCallbacks.forEach((callback) => callback(msg));
      };

      socket.onerror = (err) => {
        reject(err);
      };

      ws.value = socket;
    });
  };

  const send = (message: any) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not open, cannot send:', message);
    }
  };

  const onMessage = (callback: (msg: any) => void) => {
    messageCallbacks.push(callback);
  };

  return { ws, connect, send, onMessage };
};
