import type { ConnectionStatus } from './types.js';

export type FrontendModuleBoundary = {
  connection: 'WebSocketの接続管理・送受信';
  state: '受信メッセージをClientStateへ還元';
  render: 'ClientStateをUI表示へ変換';
};

export function toConnectionStatus(socket: Pick<WebSocket, 'readyState'>): ConnectionStatus {
  if (socket.readyState === WebSocket.OPEN) {
    return 'open';
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    return 'connecting';
  }

  return 'closed';
}
