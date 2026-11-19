import http from 'node:http';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';

const host = process.env.SERVER_HOST ?? '0.0.0.0';
const port = Number(process.env.SERVER_PORT ?? 8080);
const databasePath = process.env.DATABASE_PATH ?? './data/owner.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  );
`);

const ownerUsername = process.env.OWNER_USERNAME;
const ownerPassword = process.env.OWNER_PASSWORD;
if (!ownerUsername || !ownerPassword) {
  throw new Error('OWNER_USERNAME and OWNER_PASSWORD must be set before starting the server.');
}

function hashPassword(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex');
}

const owner = database.prepare('SELECT id FROM users WHERE username = ?').get(ownerUsername);
if (!owner) {
  const salt = crypto.randomBytes(16).toString('hex');
  database.prepare('INSERT INTO users (username, password_salt, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(ownerUsername, salt, hashPassword(ownerPassword, salt), 'owner');
}

const sessions = new Map();
const sockets = new Set();
const parties = new Map();
const slurPattern = /\b(faggot|nigger|kike|chink|spic|tranny|whore)\b/gi;

function filterChat(text) {
  return text
    .replace(slurPattern, (word) => '*'.repeat(word.length))
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .slice(0, 500);
}

function makePartyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (parties.has(code));
  return code;
}

function partyFor(socket) {
  return socket.partyCode ? parties.get(socket.partyCode) : null;
}

function partySockets(code) {
  return [...sockets].filter((socket) => socket.user && socket.partyCode === code);
}

function broadcastPlayers() {
  const players = [...sockets].filter((socket) => socket.user).map((socket) => socket.user);
  const payload = JSON.stringify({ type: 'players', players });
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function broadcastPublicParties() {
  const payload = JSON.stringify({ type: 'public_parties', parties: publicPartyList() });
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function sendParty(code, message) {
  const payload = JSON.stringify(message);
  for (const socket of partySockets(code)) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function publicPartyList() {
  return [...parties.values()].filter((party) => party.visibility === 'public').map((party) => ({
    code: party.code,
    name: party.name,
    leader: party.leader,
    members: partySockets(party.code).length + party.bots.length,
  }));
}

function broadcastParty(code) {
  const party = parties.get(code);
  if (!party) return;
  sendParty(code, {
    type: 'party',
    code: party.code,
    name: party.name,
    visibility: party.visibility,
    leader: party.leader,
    members: partySockets(code).map((socket) => socket.user),
    bots: party.bots,
    started: party.started,
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  if (body.length > 32_768) throw new Error('Request too large');
  return body ? JSON.parse(body) : {};
}

function authorize(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? request.headers['x-session-token'];
  return token ? sessions.get(token) : null;
}

function broadcastChat(socket, message) {
  if (socket.partyCode) sendParty(socket.partyCode, message);
}

const httpServer = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});

  if ((request.url === '/' || request.url === '/api/health') && request.method === 'GET') {
    return sendJson(response, 200, {
      ok: true,
      service: 'Unknown Hotel multiplayer server',
      websocket: true,
      partyLimit: 4,
    });
  }

  if (request.url === '/api/auth/register' && request.method === 'POST') {
    try {
      const { username, password } = await readJson(request);
      const cleanName = typeof username === 'string' ? username.trim() : '';
      if (!cleanName || cleanName.length > 24) return sendJson(response, 400, { error: 'Username must be 1 to 24 characters.' });
      if (typeof password !== 'string' || password.length < 6 || password.length > 64) return sendJson(response, 400, { error: 'Password must be 6 to 64 characters.' });
      const existing = database.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(cleanName);
      if (existing) return sendJson(response, 409, { error: 'That username is already registered.' });
      const salt = crypto.randomBytes(16).toString('hex');
      database.prepare('INSERT INTO users (username, password_salt, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(cleanName, salt, hashPassword(password, salt), 'user');
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { username: cleanName, role: 'user' });
      return sendJson(response, 201, { token, username: cleanName, role: 'user' });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.url === '/api/auth/login' && request.method === 'POST') {
    try {
      const { username, password } = await readJson(request);
      if (!username || !password) return sendJson(response, 400, { error: 'Username and password are required.' });
      const user = database.prepare('SELECT username, password_salt, password_hash, role FROM users WHERE lower(username) = lower(?)')
        .get(username);
      if (!user) return sendJson(response, 401, { error: 'Invalid username or password.' });
      const actual = Buffer.from(user.password_hash, 'hex');
      const expected = Buffer.from(hashPassword(password, user.password_salt), 'hex');
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return sendJson(response, 401, { error: 'Invalid username or password.' });
      }
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { username: user.username, role: user.role });
      return sendJson(response, 200, { token, username: user.username, role: user.role });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.url === '/api/admin/check' && request.method === 'GET') {
    const session = authorize(request);
    return sendJson(response, session?.role === 'owner' ? 200 : 403, {
      owner: session?.role === 'owner',
      username: session?.username ?? null,
    });
  }

  sendJson(response, 404, { error: 'Not found' });
});

const websocketServer = new WebSocketServer({ server: httpServer });
websocketServer.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON.' }));
      return;
    }

    if (message.type === 'join') {
      const session = sessions.get(message.token);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required.' }));
        socket.close();
        return;
      }
      socket.user = session.username;
      socket.send(JSON.stringify({ type: 'joined', username: socket.user, role: session.role }));
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
      broadcastPlayers();
    }

    if (message.type === 'create_party') {
      if (!socket.user) return;
      if (socket.partyCode) {
        socket.send(JSON.stringify({ type: 'error', message: 'Leave your current party first.' }));
        return;
      }
      const code = makePartyCode();
      const name = typeof message.name === 'string' ? message.name.trim().slice(0, 30) : `${socket.user}'s party`;
      const visibility = message.visibility === 'private' ? 'private' : 'public';
      parties.set(code, { code, name: name || `${socket.user}'s party`, visibility, leader: socket.user, bots: [], banned: new Set(), started: false });
      socket.partyCode = code;
      broadcastParty(code);
      broadcastPublicParties();
    }

    if (message.type === 'join_party') {
      if (!socket.user) return;
      const code = String(message.code ?? '').trim().toUpperCase();
      const party = parties.get(code);
      if (!party) {
        socket.send(JSON.stringify({ type: 'error', message: 'Party code not found.' }));
        return;
      }
      if (party.banned.has(socket.user.toLowerCase())) {
        socket.send(JSON.stringify({ type: 'party_banned', message: 'You are banned from this party.' }));
        return;
      }
      const members = partySockets(code);
      if (members.length + party.bots.length >= 4) {
        socket.send(JSON.stringify({ type: 'party_full', message: 'This party is full. Maximum 4 players.' }));
        return;
      }
      socket.partyCode = code;
      broadcastParty(code);
      broadcastPublicParties();
    }

    if (message.type === 'leave_party') {
      if (!socket.partyCode) return;
      const code = socket.partyCode;
      const party = parties.get(code);
      if (party?.leader === socket.user) {
        const remaining = partySockets(code).filter((member) => member !== socket);
        party.leader = remaining[0]?.user ?? '';
      }
      socket.partyCode = null;
      socket.send(JSON.stringify({ type: 'party_left' }));
      if (partySockets(code).length === 0) parties.delete(code);
      else broadcastParty(code);
      broadcastPublicParties();
    }

    if (message.type === 'add_bot') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) return socket.send(JSON.stringify({ type: 'error', message: 'Only the party leader can add bots.' }));
      if (partySockets(party.code).length + party.bots.length >= 4) return socket.send(JSON.stringify({ type: 'party_full', message: 'This party is full. Maximum 4 players.' }));
      const number = party.bots.length + 1;
      party.bots.push(`Bot ${number}`);
      broadcastParty(party.code);
      broadcastPublicParties();
      return;
    }

    if (message.type === 'remove_bot') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) return socket.send(JSON.stringify({ type: 'error', message: 'Only the party leader can remove bots.' }));
      party.bots = party.bots.filter((bot) => bot !== String(message.username ?? ''));
      broadcastParty(party.code);
      broadcastPublicParties();
      return;
    }

    if (message.type === 'kick_member' || message.type === 'ban_member') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) return socket.send(JSON.stringify({ type: 'error', message: 'Only the party leader can moderate members.' }));
      const username = String(message.username ?? '').trim();
      if (!username || username === socket.user) return;
      if (message.type === 'ban_member') party.banned.add(username.toLowerCase());
      const target = partySockets(party.code).find((member) => member.user === username);
      if (target) {
        target.partyCode = null;
        target.send(JSON.stringify({ type: message.type === 'ban_member' ? 'party_banned' : 'party_kicked', message: message.type === 'ban_member' ? 'You were banned from this party.' : 'You were kicked from this party.' }));
        target.send(JSON.stringify({ type: 'party_left' }));
      }
      if (party.leader === username) party.leader = socket.user;
      broadcastParty(party.code);
      broadcastPublicParties();
      return;
    }

    if (message.type === 'start_party') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) {
        socket.send(JSON.stringify({ type: 'error', message: 'Only the party leader can start the game.' }));
        return;
      }
      const memberCount = partySockets(party.code).length + party.bots.length;
      if (memberCount < 2) {
        socket.send(JSON.stringify({ type: 'error', message: 'At least 2 people or bots are required to start.' }));
        return;
      }
      party.started = true;
      broadcastParty(party.code);
      return;
    }

    if (message.type === 'player_state') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party?.started) return;
      sendParty(socket.partyCode, {
        type: 'player_state',
        username: socket.user,
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
        z: Number(message.z) || 0,
        yaw: Number(message.yaw) || 0,
        moving: Boolean(message.moving),
        crouching: Boolean(message.crouching),
      });
      return;
    }

    if (message.type === 'make_leader') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) {
        socket.send(JSON.stringify({ type: 'error', message: 'Only the party leader can transfer leadership.' }));
        return;
      }
      const username = String(message.username ?? '').trim();
      if (!partySockets(party.code).some((member) => member.user === username)) return;
      party.leader = username;
      broadcastParty(party.code);
    }

    if (message.type === 'list_public_parties') {
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
    }

    if (message.type === 'chat') {
      if (!socket.user) return;
      const rawText = typeof message.text === 'string' ? message.text.trim() : '';
      const text = filterChat(rawText);
      if (!text) return;
      broadcastChat(socket, {
        type: 'chat',
        username: socket.user,
        text,
        sentAt: Date.now(),
      });
    }

    if (message.type === 'leave') {
      socket.user = null;
      broadcastPlayers();
    }
  });
  socket.on('close', () => {
    if (socket.partyCode) {
      const code = socket.partyCode;
      const party = parties.get(code);
      if (party?.leader === socket.user) {
        const remaining = partySockets(code).filter((member) => member !== socket);
        party.leader = remaining[0]?.user ?? '';
      }
      socket.partyCode = null;
      if (partySockets(code).length === 0) parties.delete(code);
      else broadcastParty(code);
      broadcastPublicParties();
    }
    sockets.delete(socket);
    broadcastPlayers();
  });
});

httpServer.listen(port, host, () => {
  console.log(`Unknown Hotel server listening on http://${host}:${port}`);
});
