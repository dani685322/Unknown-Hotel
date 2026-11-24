import http from 'node:http';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';
import { ADMIN_USERNAMES, CHAT_ROLES } from '../Secret Folder/UsernameAdmin.js';

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
  CREATE TABLE IF NOT EXISTS account_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    recognized_at INTEGER NOT NULL,
    UNIQUE(username, ip_address)
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    creator_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    scene_json TEXT NOT NULL DEFAULT '{}',
    thumbnail TEXT NOT NULL DEFAULT 'hotel',
    version TEXT NOT NULL DEFAULT '1.0.0',
    visits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    approved_at INTEGER,
    rejection_reason TEXT
  );
  CREATE TABLE IF NOT EXISTS game_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    username_key TEXT NOT NULL,
    visit_day TEXT NOT NULL,
    visited_at INTEGER NOT NULL,
    UNIQUE(game_id, username_key, visit_day)
  );
  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(requester, recipient)
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(user_a, user_b)
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    reporter TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_blocks (
    blocker TEXT NOT NULL,
    blocked TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(blocker, blocked)
  );
  CREATE TABLE IF NOT EXISTS cosmetics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS inventory (
    username TEXT NOT NULL,
    cosmetic_id INTEGER NOT NULL,
    equipped INTEGER NOT NULL DEFAULT 0,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY(username, cosmetic_id)
  );
  CREATE TABLE IF NOT EXISTS wallets (
    username TEXT PRIMARY KEY,
    coins INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
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

const now = Date.now();
database.prepare(`
  INSERT OR IGNORE INTO games
    (slug, title, description, creator_username, status, scene_json, thumbnail, version, visits, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'published', ?, 'hotel', '1.0.2.3', 0, ?, ?)
`).run(
  'unknown-halls',
  'Unknown Halls',
  'One hundred doors. No two rooms alike. Explore the hotel with friends and keep moving.',
  ownerUsername,
  JSON.stringify({ template: 'unknown-hotel', doors: 100, multiplayer: true }),
  now,
  now,
);
const cosmeticSeed = [
  ['brass-lantern', 'Brass Lantern', 'back', 120, 'A warm light for cold corridors.'],
  ['velvet-coat', 'Velvet Coat', 'skin', 240, 'An original hotelier-inspired outfit.'],
  ['guiding-star', 'Guiding Star', 'badge', 500, 'A small sign that you found your way.'],
  ['door-emote', 'Door Knock', 'emote', 80, 'A polite knock before you enter.'],
];
const insertCosmetic = database.prepare('INSERT OR IGNORE INTO cosmetics (slug, name, kind, price, description) VALUES (?, ?, ?, ?, ?)');
for (const item of cosmeticSeed) insertCosmetic.run(...item);
database.prepare('INSERT OR IGNORE INTO wallets (username, coins, updated_at) VALUES (?, 500, ?)').run(ownerUsername, now);

const sessions = new Map();
const sockets = new Set();
const parties = new Map();
const slurPattern = /\b(faggot|nigger|kike|chink|spic|tranny|whore)\b/gi;
const chatRate = new WeakMap();

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
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
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
    difficulty: party.difficulty ?? 'Normal',
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
    difficulty: party.difficulty ?? 'Normal',
    started: party.started,
    runSeed: party.runSeed ?? null,
    roomIndex: party.roomIndex ?? 0,
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

function gameSockets(slug) {
  return [...sockets].filter((candidate) => candidate.user && candidate.gameSlug === slug);
}

function broadcastGameChat(slug, message) {
  const payload = JSON.stringify(message);
  for (const socket of gameSockets(slug)) {
    if (message.username && database.prepare('SELECT 1 FROM chat_blocks WHERE blocker = ? AND blocked = ?').get(socket.user.toLowerCase(), message.username.toLowerCase())) continue;
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function requestIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || request.socket.remoteAddress || 'unknown';
}

function rememberAccountAddress(username, ipAddress) {
  database.prepare(`
    INSERT INTO account_addresses (username, ip_address, recognized_at)
    VALUES (?, ?, ?)
    ON CONFLICT(username, ip_address) DO UPDATE SET recognized_at = excluded.recognized_at
  `).run(username, ipAddress, Date.now());
}

function chatRole(username) {
  if (username.toLowerCase() === 'hunao') return 'Owner';
  const user = database.prepare('SELECT role FROM users WHERE lower(username) = lower(?)').get(username);
  if (user?.role === 'owner') return 'Owner';
  return CHAT_ROLES.includes(user?.role) ? user.role : '';
}

function normalizeSlug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sessionFor(request) {
  return authorize(request);
}

function requireSession(request, response) {
  const session = sessionFor(request);
  if (!session) {
    sendJson(response, 401, { error: 'Authentication required.' });
    return null;
  }
  return session;
}

function requireOwner(request, response) {
  const session = requireSession(request, response);
  if (!session) return null;
  if (session.role !== 'owner') {
    sendJson(response, 403, { error: 'Owner approval is required.' });
    return null;
  }
  return session;
}

function publicGameRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    creator: row.creator_username,
    status: row.status,
    thumbnail: row.thumbnail,
    version: row.version,
    visits: row.visits,
    popular: row.visits >= 1000,
    multiplayer: true,
    updatedAt: row.updated_at,
  };
}

function creatorOwnsGame(session, row) {
  return session?.role === 'owner' || row?.creator_username.toLowerCase() === session?.username.toLowerCase();
}

function safeScene(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Scene must be a JSON object.');
  const encoded = JSON.stringify(value);
  if (encoded.length > 200_000) throw new Error('Scene is larger than 200 KB.');
  const allowedTemplates = new Set(['unknown-hotel', 'empty', 'corridor']);
  const template = value.template === undefined ? 'empty' : String(value.template);
  if (!allowedTemplates.has(template)) throw new Error('Scene template is not approved.');
  const arrays = ['rooms', 'meshes', 'lights', 'spawns', 'rules'];
  for (const key of arrays) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > 200)) throw new Error(`${key} must contain at most 200 entries.`);
  }
  if (value.scripts !== undefined) throw new Error('Executable scripts are not allowed in creator scenes.');
  return { ...value, template };
}

function normalizedPair(first, second) {
  return [first.toLowerCase(), second.toLowerCase()].sort();
}

function ensureWallet(username) {
  database.prepare('INSERT OR IGNORE INTO wallets (username, coins, updated_at) VALUES (?, 250, ?)').run(username, Date.now());
}

function userExists(username) {
  return Boolean(database.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username));
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
      ensureWallet(cleanName);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { username: cleanName, role: 'user' });
      rememberAccountAddress(cleanName, requestIp(request));
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
      ensureWallet(user.username);
      rememberAccountAddress(user.username, requestIp(request));
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

  if (request.url === '/api/me' && request.method === 'GET') {
    const session = sessionFor(request);
    if (!session) return sendJson(response, 401, { error: 'Authentication required.' });
    ensureWallet(session.username);
    const wallet = database.prepare('SELECT coins FROM wallets WHERE username = ?').get(session.username);
    return sendJson(response, 200, { username: session.username, role: session.role, coins: wallet?.coins ?? 0 });
  }

  if (request.url === '/api/games' && request.method === 'GET') {
    const search = new URL(request.url, `http://${host}`).searchParams.get('q')?.trim() ?? '';
    const rows = search
      ? database.prepare(`SELECT * FROM games WHERE status = 'published' AND (title LIKE ? OR description LIKE ?) ORDER BY visits DESC, updated_at DESC`).all(`%${search}%`, `%${search}%`)
      : database.prepare("SELECT * FROM games WHERE status = 'published' ORDER BY visits DESC, updated_at DESC").all();
    return sendJson(response, 200, { games: rows.map(publicGameRow) });
  }

  const gameMatch = request.url.match(/^\/api\/games\/([^/?]+)(?:\/(visit|submit))?$/);
  if (gameMatch && request.method === 'GET') {
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare("SELECT * FROM games WHERE slug = ? AND status = 'published'").get(slug);
    if (!row) return sendJson(response, 404, { error: 'Published game not found.' });
    let scene = {};
    try { scene = JSON.parse(row.scene_json); } catch { /* keep a safe empty scene */ }
    return sendJson(response, 200, { game: { ...publicGameRow(row), scene } });
  }

  if (gameMatch && gameMatch[2] === 'visit' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare("SELECT id, visits FROM games WHERE slug = ? AND status = 'published'").get(slug);
    if (!row) return sendJson(response, 404, { error: 'Published game not found.' });
    const result = database.prepare(`INSERT INTO game_visits (game_id, username_key, visit_day, visited_at) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, username_key, visit_day) DO NOTHING`)
      .run(row.id, session.username.toLowerCase(), dayKey(), Date.now());
    if (result.changes > 0) database.prepare('UPDATE games SET visits = visits + 1, updated_at = ? WHERE id = ?').run(Date.now(), row.id);
    const updated = database.prepare('SELECT visits FROM games WHERE id = ?').get(row.id);
    return sendJson(response, 200, { counted: result.changes > 0, visits: updated.visits, popular: updated.visits >= 1000 });
  }

  if (request.url === '/api/games' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    try {
      const body = await readJson(request);
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
      const slug = normalizeSlug(body.slug || title);
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
      if (!title || !slug) return sendJson(response, 400, { error: 'A title and valid slug are required.' });
      const scene = safeScene(body.scene ?? { template: 'empty', rooms: [], meshes: [], lights: [], spawns: [], rules: [] });
      const timestamp = Date.now();
      database.prepare(`INSERT INTO games (slug, title, description, creator_username, status, scene_json, thumbnail, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, '0.1.0', ?, ?)`)
        .run(slug, title, description, session.username, JSON.stringify(scene), String(body.thumbnail ?? 'creator').slice(0, 24), timestamp, timestamp);
      return sendJson(response, 201, { game: publicGameRow(database.prepare('SELECT * FROM games WHERE slug = ?').get(slug)) });
    } catch (error) {
      return sendJson(response, 400, { error: error.message.includes('UNIQUE') ? 'That game slug is already in use.' : error.message });
    }
  }

  if (gameMatch && !gameMatch[2] && ['PATCH', 'PUT'].includes(request.method)) {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!row || !creatorOwnsGame(session, row)) return sendJson(response, 404, { error: 'Game not found.' });
    if (row.status === 'published' && session.role !== 'owner') return sendJson(response, 409, { error: 'Published games need an owner review before changes.' });
    try {
      const body = await readJson(request);
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : row.title;
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : row.description;
      const scene = safeScene(body.scene ?? JSON.parse(row.scene_json));
      const version = typeof body.version === 'string' && /^\d+\.\d+\.\d+$/.test(body.version) ? body.version : row.version;
      database.prepare('UPDATE games SET title = ?, description = ?, scene_json = ?, thumbnail = ?, version = ?, status = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?')
        .run(title, description, JSON.stringify(scene), String(body.thumbnail ?? row.thumbnail).slice(0, 24), version, session.role === 'owner' ? row.status : 'draft', Date.now(), row.id);
      return sendJson(response, 200, { game: publicGameRow(database.prepare('SELECT * FROM games WHERE id = ?').get(row.id)) });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }

  if (gameMatch && gameMatch[2] === 'submit' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!row || !creatorOwnsGame(session, row)) return sendJson(response, 404, { error: 'Game not found.' });
    if (row.status === 'published' && session.role !== 'owner') return sendJson(response, 409, { error: 'Published games need an owner review before changes.' });
    database.prepare("UPDATE games SET status = 'pending', rejection_reason = NULL, updated_at = ? WHERE id = ?").run(Date.now(), row.id);
    return sendJson(response, 200, { status: 'pending' });
  }

  const adminGameMatch = request.url.match(/^\/api\/admin\/games\/([^/?]+)\/(approve|reject)$/);
  if (request.url === '/api/admin/games/pending' && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const rows = database.prepare("SELECT * FROM games WHERE status = 'pending' ORDER BY updated_at ASC").all();
    return sendJson(response, 200, { games: rows.map(publicGameRow) });
  }
  if (adminGameMatch && request.method === 'POST') {
    if (!requireOwner(request, response)) return;
    const slug = normalizeSlug(decodeURIComponent(adminGameMatch[1]));
    const row = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!row) return sendJson(response, 404, { error: 'Game not found.' });
    const body = await readJson(request).catch(() => ({}));
    if (adminGameMatch[2] === 'approve') {
      database.prepare("UPDATE games SET status = 'published', approved_at = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?").run(Date.now(), Date.now(), row.id);
      return sendJson(response, 200, { status: 'published' });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : 'Needs changes before publishing.';
    database.prepare("UPDATE games SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?").run(reason, Date.now(), row.id);
    return sendJson(response, 200, { status: 'rejected', reason });
  }

  if (request.url === '/api/friends' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const username = session.username.toLowerCase();
    const friends = database.prepare(`SELECT CASE WHEN lower(user_a) = ? THEN user_b ELSE user_a END AS username FROM friendships WHERE lower(user_a) = ? OR lower(user_b) = ? ORDER BY username`).all(username, username, username);
    const incoming = database.prepare("SELECT requester AS username, 'incoming' AS direction FROM friend_requests WHERE lower(recipient) = ? AND status = 'pending'").all(username);
    const outgoing = database.prepare("SELECT recipient AS username, 'outgoing' AS direction FROM friend_requests WHERE lower(requester) = ? AND status = 'pending'").all(username);
    return sendJson(response, 200, { friends, requests: [...incoming, ...outgoing] });
  }

  if (request.url === '/api/friends/request' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJson(request).catch(() => ({}));
    const target = typeof body.username === 'string' ? body.username.trim() : '';
    if (!target || target.toLowerCase() === session.username.toLowerCase() || !userExists(target)) return sendJson(response, 400, { error: 'Choose an existing player.' });
    const [userA, userB] = normalizedPair(session.username, target);
    if (database.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').get(userA, userB)) return sendJson(response, 409, { error: 'You are already friends.' });
    const timestamp = Date.now();
    try {
      database.prepare('INSERT INTO friend_requests (requester, recipient, status, created_at, updated_at) VALUES (?, ?, \'pending\', ?, ?)').run(session.username, target, timestamp, timestamp);
    } catch {
      return sendJson(response, 409, { error: 'A friend request already exists.' });
    }
    return sendJson(response, 201, { status: 'pending' });
  }

  const friendAction = request.url.match(/^\/api\/friends\/([^/?]+)\/(accept|decline)$/);
  if (friendAction && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const target = decodeURIComponent(friendAction[1]).trim();
    const requestRow = database.prepare("SELECT * FROM friend_requests WHERE lower(requester) = lower(?) AND lower(recipient) = lower(?) AND status = 'pending'").get(target, session.username);
    if (!requestRow) return sendJson(response, 404, { error: 'Pending request not found.' });
    const timestamp = Date.now();
    if (friendAction[2] === 'decline') database.prepare("UPDATE friend_requests SET status = 'declined', updated_at = ? WHERE id = ?").run(timestamp, requestRow.id);
    else {
      const [userA, userB] = normalizedPair(requestRow.requester, requestRow.recipient);
      database.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(userA, userB, timestamp);
      database.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?").run(timestamp, requestRow.id);
    }
    return sendJson(response, 200, { status: friendAction[2] === 'accept' ? 'accepted' : 'declined' });
  }

  if (request.url === '/api/catalog' && request.method === 'GET') {
    const cosmetics = database.prepare('SELECT slug, name, kind, price, description FROM cosmetics ORDER BY price, name').all();
    return sendJson(response, 200, { cosmetics });
  }

  if (request.url === '/api/inventory' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    ensureWallet(session.username);
    const wallet = database.prepare('SELECT coins FROM wallets WHERE username = ?').get(session.username);
    const items = database.prepare(`SELECT c.slug, c.name, c.kind, c.description, i.equipped FROM inventory i JOIN cosmetics c ON c.id = i.cosmetic_id WHERE i.username = ? ORDER BY c.name`).all(session.username);
    return sendJson(response, 200, { coins: wallet?.coins ?? 0, items });
  }

  if (request.url === '/api/shop/purchase' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJson(request).catch(() => ({}));
    const slug = normalizeSlug(body.slug);
    const cosmetic = database.prepare('SELECT * FROM cosmetics WHERE slug = ?').get(slug);
    if (!cosmetic) return sendJson(response, 404, { error: 'Cosmetic not found.' });
    ensureWallet(session.username);
    if (database.prepare('SELECT 1 FROM inventory WHERE username = ? AND cosmetic_id = ?').get(session.username, cosmetic.id)) return sendJson(response, 409, { error: 'Already owned.' });
    const wallet = database.prepare('SELECT coins FROM wallets WHERE username = ?').get(session.username);
    if ((wallet?.coins ?? 0) < cosmetic.price) return sendJson(response, 400, { error: 'Not enough coins.' });
    const timestamp = Date.now();
    database.prepare('UPDATE wallets SET coins = coins - ?, updated_at = ? WHERE username = ?').run(cosmetic.price, timestamp, session.username);
    database.prepare('INSERT INTO inventory (username, cosmetic_id, acquired_at) VALUES (?, ?, ?)').run(session.username, cosmetic.id, timestamp);
    return sendJson(response, 201, { purchased: cosmetic.slug, coins: wallet.coins - cosmetic.price });
  }

  if (request.url === '/api/shop/equip' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJson(request).catch(() => ({}));
    const slug = normalizeSlug(body.slug);
    const cosmetic = database.prepare('SELECT id FROM cosmetics WHERE slug = ?').get(slug);
    if (!cosmetic || !database.prepare('SELECT 1 FROM inventory WHERE username = ? AND cosmetic_id = ?').get(session.username, cosmetic.id)) return sendJson(response, 404, { error: 'Cosmetic is not in your inventory.' });
    database.prepare('UPDATE inventory SET equipped = 0 WHERE username = ?').run(session.username);
    database.prepare('UPDATE inventory SET equipped = 1 WHERE username = ? AND cosmetic_id = ?').run(session.username, cosmetic.id);
    return sendJson(response, 200, { equipped: slug });
  }

  if (request.url === '/api/chat/report' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJson(request).catch(() => ({}));
    const messageId = Number(body.messageId);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 160) : '';
    if (!Number.isInteger(messageId) || !reason) return sendJson(response, 400, { error: 'A message id and reason are required.' });
    database.prepare('INSERT INTO chat_reports (message_id, reporter, reason, created_at) VALUES (?, ?, ?, ?)').run(messageId, session.username, reason, Date.now());
    return sendJson(response, 201, { reported: true });
  }

  if (request.url === '/api/chat/block' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJson(request).catch(() => ({}));
    const blocked = typeof body.username === 'string' ? body.username.trim() : '';
    if (!blocked || blocked.toLowerCase() === session.username.toLowerCase()) return sendJson(response, 400, { error: 'Choose another player.' });
    database.prepare('INSERT OR IGNORE INTO chat_blocks (blocker, blocked, created_at) VALUES (?, ?, ?)').run(session.username.toLowerCase(), blocked.toLowerCase(), Date.now());
    return sendJson(response, 201, { blocked });
  }

  if (request.url === '/api/admin/chat/reports' && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const reports = database.prepare('SELECT id, message_id AS messageId, reporter, reason, created_at AS createdAt FROM chat_reports ORDER BY created_at DESC LIMIT 200').all();
    return sendJson(response, 200, { reports });
  }

  sendJson(response, 404, { error: 'Not found' });
});

const websocketServer = new WebSocketServer({ server: httpServer, maxPayload: 32_768, perMessageDeflate: false });
const heartbeat = setInterval(() => {
  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();
websocketServer.on('close', () => clearInterval(heartbeat));

websocketServer.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  sockets.add(socket);
  socket.on('message', (raw) => {
    if (raw.length > 32_768) {
      socket.close(1009, 'Message too large.');
      return;
    }
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON.' }));
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
      return;
    }

    if (message.type === 'join') {
      if (socket.user) {
        socket.send(JSON.stringify({ type: 'error', message: 'This connection is already authenticated.' }));
        return;
      }
      const session = sessions.get(message.token);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required.' }));
        socket.close();
        return;
      }
      socket.user = session.username;
      const requestedGame = normalizeSlug(message.gameSlug || 'unknown-halls');
      const publishedGame = database.prepare("SELECT slug FROM games WHERE slug = ? AND status = 'published'").get(requestedGame);
      socket.gameSlug = publishedGame?.slug ?? 'unknown-halls';
      socket.send(JSON.stringify({ type: 'joined', username: socket.user, role: chatRole(socket.user) }));
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
      const validDifficulties = new Set(['Easy', 'Normal', 'Hard', 'Extreme', 'Hell']);
      const difficulty = validDifficulties.has(message.difficulty) ? message.difficulty : 'Normal';
      parties.set(code, { code, name: name || `${socket.user}'s party`, visibility, leader: socket.user, difficulty, bots: [], banned: new Set(), started: false });
      socket.partyCode = code;
      broadcastParty(code);
      broadcastPublicParties();
    }

    if (message.type === 'join_party') {
      if (!socket.user) return;
      if (socket.partyCode) {
        socket.send(JSON.stringify({ type: 'error', message: 'Leave your current party first.' }));
        return;
      }
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
      socket.send(JSON.stringify({ type: 'party_joined', code, name: party.name }));
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
      party.runSeed = crypto.randomInt(0x1_0000_0000);
      party.roomIndex = 0;
      const startedParty = {
        type: 'party_started',
        code: party.code,
        name: party.name,
        visibility: party.visibility,
        leader: party.leader,
        members: partySockets(party.code).map((member) => member.user),
        bots: party.bots,
        difficulty: party.difficulty ?? 'Normal',
        started: true,
        runSeed: party.runSeed,
        roomIndex: 0,
      };
      sendParty(party.code, startedParty);
      broadcastParty(party.code);
      return;
    }

    if (message.type === 'room_state') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party?.started || party.leader !== socket.user) return;
      const requestedRoom = Number(message.roomIndex);
      if (!Number.isInteger(requestedRoom)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Room index must be an integer.' }));
        return;
      }
      const roomIndex = Math.max(0, Math.min(100, requestedRoom));
      party.roomIndex = roomIndex;
      sendParty(party.code, {
        type: 'room_state',
        roomIndex,
        runSeed: party.runSeed,
      });
      return;
    }

    if (message.type === 'player_state') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party?.started) return;
      const coordinates = [message.x, message.y, message.z, message.yaw].map(Number);
      if (!coordinates.every(Number.isFinite)) return;
      sendParty(socket.partyCode, {
        type: 'player_state',
        username: socket.user,
        x: Math.max(-2500, Math.min(2500, coordinates[0])),
        y: Math.max(0, Math.min(4, coordinates[1])),
        z: Math.max(-2500, Math.min(2500, coordinates[2])),
        yaw: Math.max(-Math.PI * 8, Math.min(Math.PI * 8, coordinates[3])),
        moving: Boolean(message.moving),
        crouching: Boolean(message.crouching),
      });
      return;
    }

    if (message.type === 'set_difficulty') {
      if (!socket.partyCode) return;
      const party = parties.get(socket.partyCode);
      if (!party || party.leader !== socket.user) return;
      if (!['Easy', 'Normal', 'Hard', 'Extreme', 'Hell'].includes(message.difficulty)) return;
      party.difficulty = message.difficulty;
      broadcastParty(party.code);
      broadcastPublicParties();
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

    if (message.type === 'promote_user') {
      if (!socket.user || !ADMIN_USERNAMES.has(socket.user.toLowerCase())) {
        socket.send(JSON.stringify({ type: 'error', message: 'You are not allowed to promote players.' }));
        return;
      }
      const username = String(message.username ?? '').trim();
      const role = String(message.role ?? '');
      if (!username || !CHAT_ROLES.includes(role) || username.toLowerCase() === 'hunao') {
        socket.send(JSON.stringify({ type: 'error', message: 'Choose a valid username and role. Owner is reserved for HuNao.' }));
        return;
      }
      const target = database.prepare('SELECT username, role FROM users WHERE lower(username) = lower(?)').get(username);
      if (!target || target.role === 'owner') {
        socket.send(JSON.stringify({ type: 'error', message: 'Account not found or its Owner role cannot be changed.' }));
        return;
      }
      database.prepare('UPDATE users SET role = ? WHERE lower(username) = lower(?)').run(role, target.username);
      for (const session of sessions.values()) {
        if (session.username.toLowerCase() === target.username.toLowerCase()) session.role = role;
      }
      const update = JSON.stringify({
        type: 'role_updated',
        username: target.username,
        role,
        promotedBy: socket.user,
      });
      for (const client of sockets) {
        if (client.readyState === WebSocket.OPEN) client.send(update);
      }
      return;
    }

    if (message.type === 'list_public_parties') {
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
    }

    if (message.type === 'chat') {
      if (!socket.user) return;
      const rawText = typeof message.text === 'string' ? message.text.trim() : '';
      const text = filterChat(rawText);
      if (!text) return;
      const payload = {
        type: 'chat',
        username: socket.user,
        role: chatRole(socket.user),
        text,
        sentAt: Date.now(),
      };
      if (socket.partyCode) broadcastChat(socket, payload);
      else {
        const gameSlug = socket.gameSlug ?? 'unknown-halls';
        const stored = database.prepare('INSERT INTO chat_messages (scope, scope_id, username, text, created_at) VALUES (\'game\', ?, ?, ?, ?)').run(gameSlug, socket.user, text, payload.sentAt);
        broadcastGameChat(gameSlug, { ...payload, type: 'game_chat', gameSlug, messageId: Number(stored.lastInsertRowid) });
      }
    }

    if (message.type === 'game_chat') {
      if (!socket.user || !socket.gameSlug) return;
      const current = Date.now();
      const previous = chatRate.get(socket) ?? 0;
      if (current - previous < 700) {
        socket.send(JSON.stringify({ type: 'error', message: 'Please slow down before sending another message.' }));
        return;
      }
      chatRate.set(socket, current);
      const rawText = typeof message.text === 'string' ? message.text.trim() : '';
      const text = filterChat(rawText).slice(0, 240);
      if (!text) return;
      const stored = database.prepare('INSERT INTO chat_messages (scope, scope_id, username, text, created_at) VALUES (\'game\', ?, ?, ?, ?)').run(socket.gameSlug, socket.user, text, current);
      broadcastGameChat(socket.gameSlug, {
        type: 'game_chat',
        gameSlug: socket.gameSlug,
        messageId: Number(stored.lastInsertRowid),
        username: socket.user,
        role: chatRole(socket.user),
        text,
        sentAt: current,
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
