export class PartyChat {
  constructor({ game }) {
    this.game = game;
    this.opened = false;
    this.messages = [];
    this.root = document.createElement('section');
    this.root.className = 'party-chat';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header><span>FREE PARTY CHAT</span><b>[T] OPEN · 4 PLAYER MAX</b></header>
      <div class="party-chat__messages" role="log" aria-live="polite"></div>
      <form class="party-chat__form">
        <input maxlength="500" autocomplete="off" placeholder="Message party" aria-label="Party chat message">
      </form>`;
    document.body.append(this.root);

    this.output = this.root.querySelector('.party-chat__messages');
    this.input = this.root.querySelector('input');
    this.form = this.root.querySelector('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.send();
    });
    this.input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.code === 'Escape') this.close();
    });
    document.addEventListener('keydown', (event) => {
      const shouldOpen = (event.code === 'KeyT' || event.code === 'Enter')
        && !event.repeat
        && !this.opened
        && document.pointerLockElement;
      if (shouldOpen && !this.game.admin?.opened) {
        event.preventDefault();
        event.stopPropagation();
        this.open();
      }
    }, true);
  }

  open() {
    this.opened = true;
    this.root.hidden = false;
    this.input.focus();
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    this.input.blur();
  }

  send() {
    const text = this.input.value.trim();
    if (!text) return;
    const socket = this.game.multiplayer?.ws;
    if (!socket?.socket || socket.socket.readyState !== WebSocket.OPEN) {
      this.receive({ username: 'System', text: 'Connect to the party server first.' });
      return;
    }
    socket.sendChat(text);
    this.input.value = '';
  }

  receive(message) {
    const safeText = String(message.text ?? '')
      .replace(/\b(faggot|nigger|kike|chink|spic|tranny|whore)\b/gi, (word) => '*'.repeat(word.length))
      .replace(/https?:\/\/\S+/gi, '[link removed]')
      .slice(0, 500);
    message = { ...message, text: safeText };
    this.messages.push(message);
    this.messages = this.messages.slice(-100);
    const line = document.createElement('div');
    line.innerHTML = `<b></b><span></span>`;
    line.querySelector('b').textContent = `${message.username}:`;
    line.querySelector('span').textContent = message.text;
    this.output.append(line);
    while (this.output.childElementCount > 100) this.output.firstElementChild.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }

  destroy() {
    this.root.remove();
  }
}

export default PartyChat;
