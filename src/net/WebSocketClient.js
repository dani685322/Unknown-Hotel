export class WebSocketClient {
  constructor({ url, username, token, onOpen, onClose, onError, onPlayers, onParty, onPublicParties, onMessage, onModeration, onPlayerState, onPartyLeft, onPartyJoined, onPartyStarted, onRoomState, onRoleUpdated }) {
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
    this.onModeration = onModeration;
    this.onPlayerState = onPlayerState;
    this.onPartyLeft = onPartyLeft;
    this.onPartyJoined = onPartyJoined;
    this.onPartyStarted = onPartyStarted;
    this.onRoomState = onRoomState;
    this.onRoleUpdated = onRoleUpdated;
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
      if (message.type === 'party_joined') this.onPartyJoined?.(message);
      if (message.type === 'party_started') this.onPartyStarted?.(message);
      if (message.type === 'party_full') this.onError?.(message.message ?? 'The party is full.');
      if (message.type === 'party_kicked') {
        this.onModeration?.(message.message ?? 'You were kicked from the party.');
        this.onError?.(message.message ?? 'You were kicked from the party.');
      }
      if (message.type === 'party_banned') {
        this.onModeration?.(message.message ?? 'You were banned from the party.');
        this.onError?.(message.message ?? 'You were banned from the party.');
      }
      if (message.type === 'error') this.onError?.(message.message ?? 'Server rejected the connection.');
      if (message.type === 'chat') this.onMessage?.(message);
      if (message.type === 'role_updated') this.onRoleUpdated?.(message);
      if (message.type === 'player_state') this.onPlayerState?.(message);
      if (message.type === 'room_state') this.onRoomState?.(message);
      if (message.type === 'party_left') this.onPartyLeft?.();
    });
    this.socket.addEventListener('close', (event) => this.onClose?.(event));
    this.socket.addEventListener('error', () => this.onError?.('Could not connect to the WebSocket server.'));
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  createParty(name, visibility, difficulty) {
    this.send({ type: 'create_party', name, visibility, difficulty });
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

  promoteUser(username, role) {
    return this.send({ type: 'promote_user', username, role });
  }

  kickMember(username) {
    this.send({ type: 'kick_member', username });
  }

  banMember(username) {
    this.send({ type: 'ban_member', username });
  }

  addBot() {
    this.send({ type: 'add_bot' });
  }

  removeBot(username) {
    this.send({ type: 'remove_bot', username });
  }

  setDifficulty(difficulty) {
    this.send({ type: 'set_difficulty', difficulty });
  }

  listPublicParties() {
    this.send({ type: 'list_public_parties' });
  }

  startParty() {
    this.send({ type: 'start_party' });
  }

  sendPlayerState(state) {
    this.send({ type: 'player_state', ...state });
  }

  sendRoomState(roomIndex) {
    this.send({ type: 'room_state', roomIndex });
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
