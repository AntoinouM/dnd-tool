export type IncomingMessage =
  | { type: 'create-room' }
  | { type: 'join-room'; roomId: string }
  | { type: 'update-state'; roomId: string; state: any };
