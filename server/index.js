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
    members: partySockets(party.code).length,
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
      parties.set(code, { code, name: name || `${socket.user}'s party`, visibility, leader: socket.user });
      socket.partyCode = code;
      broadcastParty(code);
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
    }

    if (message.type === 'join_party') {
      if (!socket.user) return;
      const code = String(message.code ?? '').trim().toUpperCase();
      const party = parties.get(code);
      if (!party) {
        socket.send(JSON.stringify({ type: 'error', message: 'Party code not found.' }));
        return;
      }
      const members = partySockets(code);
      if (members.length >= 4) {
        socket.send(JSON.stringify({ type: 'party_full', message: 'This party is full. Maximum 4 players.' }));
        return;
      }
      socket.partyCode = code;
      broadcastParty(code);
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
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
      if (partySockets(code).length === 0) parties.delete(code);
      else broadcastParty(code);
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
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
      const text = typeof message.text === 'string' ? message.text.trim().slice(0, 500) : '';
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
    }
    sockets.delete(socket);
  });
});

httpServer.listen(port, host, () => {
  console.log(`Unknown Hotel server listening on http://${host}:${port}`);
});
