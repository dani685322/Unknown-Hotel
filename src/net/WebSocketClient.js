export class WebSocketClient {
  constructor({ url, username, token, gameSlug = 'unknown-halls', onOpen, onClose, onError, onJoined, onPlayers, onGamePlayers, onParty, onPublicParties, onMessage, onGameChat, onGameTyping, onModeration, onPlayerState, onPartyLeft, onPartyJoined, onPartyStarted, onRoomState, onRoleUpdated }) {
    this.url = url;
    this.username = username;
    this.token = token;
    this.gameSlug = gameSlug;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.onJoined = onJoined;
    this.onPlayers = onPlayers;
    this.onGamePlayers = onGamePlayers;
    this.onParty = onParty;
    this.onPublicParties = onPublicParties;
    this.onMessage = onMessage;
    this.onGameChat = onGameChat;
    this.onGameTyping = onGameTyping;
    this.onModeration = onModeration;
    this.onPlayerState = onPlayerState;
    this.onPartyLeft = onPartyLeft;
    this.onPartyJoined = onPartyJoined;
    this.onPartyStarted = onPartyStarted;
    this.onRoomState = onRoomState;
    this.onRoleUpdated = onRoleUpdated;
    this.socket = null;
    this.connectionTimeout = null;
    this.authenticated = false;
  }

  connect() {
    if (this.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.socket.readyState)) return false;
    clearTimeout(this.connectionTimeout);
    this.authenticated = false;
    try {
      this.socket = new WebSocket(this.url);
    } catch (error) {
      this.onError?.(error instanceof Error ? error.message : 'Could not open the WebSocket connection.');
      return false;
    }
    const socket = this.socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.send({ type: 'join', username: this.username, token: this.token, gameSlug: this.gameSlug, client: 'unknown-hotel-beta' });
      this.onOpen?.();
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.onError?.('The server sent an invalid message.');
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
        this.onError?.('The server sent an invalid message.');
        return;
      }
      if (message.type === 'joined') {
        this.authenticated = true;
        clearTimeout(this.connectionTimeout);
        this.onJoined?.(message);
      }
      if (message.type === 'players') this.onPlayers?.(Array.isArray(message.players) ? message.players : []);
      if (message.type === 'game_players') this.onGamePlayers?.(message.gameSlug, Array.isArray(message.players) ? message.players : []);
      if (message.type === 'party') this.onParty?.(message);
      if (message.type === 'public_parties') this.onPublicParties?.(Array.isArray(message.parties) ? message.parties : []);
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
      if (message.type === 'game_chat') this.onGameChat?.(message);
      if (message.type === 'game_typing') this.onGameTyping?.(message);
      if (message.type === 'role_updated') this.onRoleUpdated?.(message);
      if (message.type === 'player_state') this.onPlayerState?.(message);
      if (message.type === 'room_state') this.onRoomState?.(message);
      if (message.type === 'party_left') this.onPartyLeft?.();
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      clearTimeout(this.connectionTimeout);
      this.socket = null;
      this.authenticated = false;
      this.onClose?.(event);
    });
    socket.addEventListener('error', () => {
      clearTimeout(this.connectionTimeout);
      this.onError?.('Could not connect to the WebSocket server.');
    });
    this.connectionTimeout = setTimeout(() => {
      if (this.socket !== socket || this.authenticated || socket.readyState === WebSocket.CLOSED) return;
      this.onError?.('Timed out waiting for the multiplayer server.');
      socket.close();
    }, 10_000);
    return true;
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        const payload = JSON.stringify(message);
        if (typeof payload !== 'string') return false;
        this.socket.send(payload);
        return true;
      } catch (error) {
        this.onError?.(error instanceof Error ? error.message : 'Could not send a message.');
        return false;
      }
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

  sendGamePlayerState(state) {
    this.send({ type: 'scene_player_state', ...state });
  }

  sendRoomState(roomIndex) {
    this.send({ type: 'room_state', roomIndex });
  }

  sendChat(text) {
    this.send({ type: 'chat', text });
  }

  sendGameChat(text) {
    return this.send({ type: 'game_chat', text });
  }

  sendGameTyping(isTyping) {
    return this.send({ type: 'game_typing', isTyping: isTyping === true });
  }

  disconnect() {
    const socket = this.socket;
    if (!socket) return;
    clearTimeout(this.connectionTimeout);
    this.authenticated = false;
    if (socket.readyState === WebSocket.OPEN) this.send({ type: 'leave', username: this.username });
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close(1000, 'Client disconnected');
  }
}

export default WebSocketClient;
