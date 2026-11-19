export class WebSocketClient {
  constructor({ url, username, token, onOpen, onClose, onError, onPlayers, onParty, onPublicParties, onMessage }) {
    this.url = url;
    this.username = username;
    this.token = token;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.onPlayers = onPlayers;
    this.onParty = onParty;
    this.onPublicParties = onPublicParties;
    this.onMessage = onMessage;
    this.socket = null;
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', () => {
      this.send({ type: 'join', username: this.username, token: this.token, client: 'unknown-hotel-beta' });
      this.onOpen?.();
    });
    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.onError?.('The server sent an invalid message.');
        return;
      }
      if (message.type === 'players') this.onPlayers?.(message.players ?? []);
      if (message.type === 'party') this.onParty?.(message);
      if (message.type === 'public_parties') this.onPublicParties?.(message.parties ?? []);
      if (message.type === 'party_full') this.onError?.(message.message ?? 'The party is full.');
      if (message.type === 'error') this.onError?.(message.message ?? 'Server rejected the connection.');
      if (message.type === 'chat') this.onMessage?.(message);
    });
    this.socket.addEventListener('close', (event) => this.onClose?.(event));
    this.socket.addEventListener('error', () => this.onError?.('Could not connect to the WebSocket server.'));
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  createParty(name, visibility) {
    this.send({ type: 'create_party', name, visibility });
  }

  joinParty(code) {
    this.send({ type: 'join_party', code });
  }

  leaveParty() {
    this.send({ type: 'leave_party' });
  }

  makeLeader(username) {
    this.send({ type: 'make_leader', username });
  }

  listPublicParties() {
    this.send({ type: 'list_public_parties' });
  }

  sendChat(text) {
    this.send({ type: 'chat', text });
  }

  disconnect() {
    this.send({ type: 'leave', username: this.username });
    this.socket?.close();
  }
}

export default WebSocketClient;
