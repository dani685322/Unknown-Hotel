import http from 'node:http';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';
import { ADMIN_USERNAMES, CHAT_ROLES } from '../Secret Folder/UsernameAdmin.js';
import { normalizeBlueprint } from '../src/core/BlueprintGraph.js';

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
    created_at INTEGER NOT NULL,
    reviewed_by TEXT,
    reviewed_at INTEGER,
    review_action TEXT,
    review_note TEXT
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
  CREATE TABLE IF NOT EXISTS game_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scene_json TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(game_id, version)
  );
  CREATE TABLE IF NOT EXISTS coin_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    amount INTEGER NOT NULL,
    source TEXT NOT NULL,
    reference TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(username, source, reference)
  );
  CREATE TABLE IF NOT EXISTS moderation_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moderator TEXT NOT NULL,
    target_username TEXT NOT NULL,
    action TEXT NOT NULL,
    game_slug TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
`);
const chatReportColumns = new Set(database.prepare('PRAGMA table_info(chat_reports)').all().map((column) => column.name));
for (const [name, definition] of [
  ['reviewed_by', 'TEXT'],
  ['reviewed_at', 'INTEGER'],
  ['review_action', 'TEXT'],
  ['review_note', 'TEXT'],
]) {
  if (!chatReportColumns.has(name)) database.exec(`ALTER TABLE chat_reports ADD COLUMN ${name} ${definition}`);
}
database.exec(`
  CREATE INDEX IF NOT EXISTS idx_games_status_visits ON games(status, visits DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_games_creator_status ON games(creator_username, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_game_visits_user_day ON game_visits(username_key, visit_day);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient ON friend_requests(recipient, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_scope ON chat_messages(scope, scope_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_reports_created ON chat_reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_report_message ON chat_reports(message_id, reporter);
  CREATE INDEX IF NOT EXISTS idx_moderation_actions_created ON moderation_actions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_coin_ledger_username ON coin_ledger(username, created_at DESC);
  INSERT OR IGNORE INTO coin_ledger (username, amount, source, reference, created_at)
    SELECT username, coins, 'migration', 'existing-wallet', updated_at FROM wallets WHERE coins <> 0;
  INSERT OR IGNORE INTO game_versions (game_id, version, title, description, scene_json, created_by, created_at)
    SELECT id, version, title, description, scene_json, creator_username, updated_at FROM games WHERE status = 'published';
  INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, unixepoch() * 1000);
  INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, unixepoch() * 1000);
  INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, unixepoch() * 1000);
`);

const ownerUsername = process.env.OWNER_USERNAME;
const ownerPassword = process.env.OWNER_PASSWORD;
if (!ownerUsername || !ownerPassword) {
  throw new Error('OWNER_USERNAME and OWNER_PASSWORD must be set before starting the server.');
}
const isOwnerUsername = (username) => typeof username === 'string' && username.toLowerCase() === ownerUsername.toLowerCase();

function hashPassword(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex');
}

const owner = database.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(ownerUsername);
if (!owner) {
  const salt = crypto.randomBytes(16).toString('hex');
  database.prepare('INSERT INTO users (username, password_salt, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(ownerUsername, salt, hashPassword(ownerPassword, salt), 'owner');
}
// The configured owner identity is authoritative. This repairs an existing
// account that was created before owner role support was added without ever
// storing or logging the plaintext password.
database.prepare("UPDATE users SET role = 'owner' WHERE lower(username) = lower(?)").run(ownerUsername);

const now = Date.now();
database.prepare(`
  INSERT OR IGNORE INTO games
    (slug, title, description, creator_username, status, scene_json, thumbnail, version, visits, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'published', ?, 'hotel', '1.0.2.4', 0, ?, ?)
`).run(
  'unknown-halls',
  'Unknown Halls',
  'One hundred doors. No two rooms alike. Explore the hotel with friends and keep moving.',
  ownerUsername,
  JSON.stringify({ template: 'unknown-hotel', doors: 100, multiplayer: true }),
  now,
  now,
);
database.prepare("UPDATE games SET version = '1.0.2.4', updated_at = ? WHERE slug = 'unknown-halls' AND lower(creator_username) = lower(?)").run(now, ownerUsername);
const seededGame = database.prepare('SELECT id, version, title, description, scene_json FROM games WHERE slug = ?').get('unknown-halls');
database.prepare('INSERT OR IGNORE INTO game_versions (game_id, version, title, description, scene_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(seededGame.id, seededGame.version, seededGame.title, seededGame.description, seededGame.scene_json, ownerUsername, now);
const cosmeticSeed = [
  ['brass-lantern', 'Brass Lantern', 'back', 120, 'A warm light for cold corridors.'],
  ['velvet-coat', 'Velvet Coat', 'skin', 240, 'An original hotelier-inspired outfit.'],
  ['guiding-star', 'Guiding Star', 'badge', 500, 'A small sign that you found your way.'],
  ['door-emote', 'Door Knock', 'emote', 80, 'A polite knock before you enter.'],
];
const insertCosmetic = database.prepare('INSERT OR IGNORE INTO cosmetics (slug, name, kind, price, description) VALUES (?, ?, ?, ?, ?)');
for (const item of cosmeticSeed) insertCosmetic.run(...item);
const seededWallet = database.prepare('INSERT OR IGNORE INTO wallets (username, coins, updated_at) VALUES (?, 500, ?)').run(ownerUsername, now);
if (seededWallet.changes > 0) {
  database.prepare('INSERT INTO coin_ledger (username, amount, source, reference, created_at) VALUES (?, 500, ?, ?, ?)')
    .run(ownerUsername, 'welcome', 'account', now);
}

const sessions = new Map();
const sockets = new Set();
const parties = new Map();
const slurPattern = /\b(faggot|nigger|kike|chink|spic|tranny|whore)\b/gi;
const chatRate = new WeakMap();
const gameStateRate = new WeakMap();

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
  const parsed = body ? JSON.parse(body) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('A JSON object is required.');
  return parsed;
}

async function readJsonOrError(request, response) {
  try {
    return await readJson(request);
  } catch (error) {
    sendJson(response, error.message === 'Request too large' ? 413 : 400, { error: error.message });
    return null;
  }
}

function authorize(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? request.headers['x-session-token'];
  return token ? sessions.get(token) : null;
}

function broadcastChat(socket, message) {
  if (!socket.partyCode) return;
  const payload = JSON.stringify(message);
  for (const recipient of partySockets(socket.partyCode)) {
    if (message.username && database.prepare('SELECT 1 FROM chat_blocks WHERE blocker = ? AND blocked = ?')
      .get(recipient.user.toLowerCase(), message.username.toLowerCase())) continue;
    if (recipient.readyState === WebSocket.OPEN) recipient.send(payload);
  }
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

function broadcastGamePresence(slug) {
  const activePlayers = gameSockets(slug).filter((socket) => socket.gameMultiplayer !== false);
  const players = activePlayers.map((socket) => ({
    username: socket.user,
    x: socket.scenePosition?.x ?? 0,
    y: socket.scenePosition?.y ?? 0,
    z: socket.scenePosition?.z ?? 0,
    yaw: socket.scenePosition?.yaw ?? 0,
  }));
  const payload = JSON.stringify({ type: 'game_players', gameSlug: slug, players });
  for (const socket of activePlayers) {
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
  if (isOwnerUsername(username)) return 'Owner';
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

function withTransaction(callback) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
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

function allowChatMessage(socket) {
  const current = Date.now();
  const previous = chatRate.get(socket) ?? 0;
  if (current - previous < 700) return false;
  chatRate.set(socket, current);
  return true;
}

function publicGameRow(row) {
  const scene = safeScene(JSON.parse(row.scene_json));
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
    multiplayer: scene.multiplayer,
    maxPlayers: scene.maxPlayers,
    updatedAt: row.updated_at,
  };
}

function publishGameVersion(row, moderator) {
  const [majorValue, minorValue, patchValue] = String(row.version).split('.').map(Number);
  const major = Number.isInteger(majorValue) ? majorValue : 0;
  const minor = Number.isInteger(minorValue) ? minorValue : 1;
  let patch = Number.isInteger(patchValue) ? patchValue : 0;
  let version = row.version;
  while (database.prepare('SELECT 1 FROM game_versions WHERE game_id = ? AND version = ?').get(row.id, version)) {
    version = `${major}.${minor}.${++patch}`;
  }
  const timestamp = Date.now();
  database.prepare("UPDATE games SET status = 'published', version = ?, approved_at = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?")
    .run(version, timestamp, timestamp, row.id);
  database.prepare('INSERT INTO game_versions (game_id, version, title, description, scene_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(row.id, version, row.title, row.description, row.scene_json, moderator, timestamp);
  return version;
}

function creatorOwnsGame(session, row) {
  return session?.role === 'owner' || row?.creator_username.toLowerCase() === session?.username.toLowerCase();
}

const sceneMaterials = new Set(['wood', 'stone', 'brass', 'fabric', 'glass', 'concrete']);
const sceneRules = new Set(['open-door', 'show-message', 'complete', 'toggle-light']);
const sceneEvents = new Set(['enter', 'interact', 'collect', 'timer']);

function sceneNumber(value, key, fallback, min, max) {
  const number = value[key] === undefined ? fallback : value[key];
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}.`);
  }
  return number;
}

function sceneMaterial(value) {
  const material = value.material === undefined ? 'wood' : value.material;
  if (typeof material !== 'string' || !sceneMaterials.has(material)) throw new Error('Scene material is not approved.');
  return material;
}

function sceneColor(value, fallback = '#d5b16a') {
  const color = value.color === undefined ? fallback : value.color;
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Scene colors must use a six-digit hex value.');
  return color.toLowerCase();
}

function sceneEntities(value, key, max, normalize) {
  const items = value[key] ?? [];
  if (!Array.isArray(items) || items.length > max) throw new Error(`${key} must contain at most ${max} entries.`);
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${key}[${index}] must be an object.`);
    return normalize(item, index);
  });
}

function safeScene(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Scene must be a JSON object.');
  const encoded = JSON.stringify(value);
  if (encoded.length > 200_000) throw new Error('Scene is larger than 200 KB.');
  const allowedTemplates = new Set(['unknown-hotel', 'empty', 'corridor']);
  const template = value.template === undefined ? 'empty' : String(value.template);
  if (!allowedTemplates.has(template)) throw new Error('Scene template is not approved.');
  if (value.scripts !== undefined) throw new Error('Executable scripts are not allowed in creator scenes.');
  const allowedKeys = new Set(['template', 'rooms', 'meshes', 'lights', 'spawns', 'doors', 'triggers', 'rules', 'blueprint', 'multiplayer', 'maxPlayers', 'doorCount']);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) throw new Error(`Scene property "${unknownKey}" is not supported.`);
  const legacyDoorCount = template === 'unknown-hotel' && Number.isInteger(value.doors) ? value.doors : undefined;
  if (value.doors !== undefined && !Array.isArray(value.doors) && legacyDoorCount === undefined) throw new Error('doors must be an array.');
  const sceneObjectIds = new Set();
  const sceneObjectId = (item, prefix, index) => {
    const id = item.id === undefined ? `${prefix}-${index + 1}` : item.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Scene object id must be a short identifier.');
    if (sceneObjectIds.has(id)) throw new Error('Scene object ids must be unique.');
    sceneObjectIds.add(id);
    return id;
  };
  const normalizeBox = (item, index, prefix) => ({
    id: sceneObjectId(item, prefix, index),
    x: sceneNumber(item, 'x', 0, -100, 100),
    y: sceneNumber(item, 'y', 0, -100, 100),
    z: sceneNumber(item, 'z', 0, -100, 100),
    width: sceneNumber(item, 'width', 2, 0.1, 100),
    height: sceneNumber(item, 'height', 2, 0.1, 100),
    depth: sceneNumber(item, 'depth', 0.5, 0.1, 100),
    material: sceneMaterial(item),
  });
  const rooms = sceneEntities(value, 'rooms', 100, (item, index) => ({
    ...normalizeBox(item, index, 'room'),
    material: sceneMaterial(item),
  }));
  const meshes = sceneEntities(value, 'meshes', 200, (item, index) => normalizeBox(item, index, 'mesh'));
  const lights = sceneEntities(value, 'lights', 50, (item, index) => ({
    id: sceneObjectId(item, 'light', index),
    x: sceneNumber(item, 'x', 0, -100, 100),
    y: sceneNumber(item, 'y', 3, -100, 100),
    z: sceneNumber(item, 'z', 0, -100, 100),
    color: sceneColor(item),
    intensity: sceneNumber(item, 'intensity', 1, 0, 5),
    distance: sceneNumber(item, 'distance', 12, 0.1, 100),
  }));
  const spawns = sceneEntities(value, 'spawns', 8, (item, index) => ({
    id: sceneObjectId(item, 'spawn', index),
    x: sceneNumber(item, 'x', 0, -100, 100),
    y: sceneNumber(item, 'y', 0, -100, 100),
    z: sceneNumber(item, 'z', 0, -100, 100),
  }));
  const doors = legacyDoorCount === undefined ? sceneEntities(value, 'doors', 50, (item, index) => ({
    ...normalizeBox(item, index, 'door'),
    locked: item.locked === undefined ? false : item.locked,
  })) : [];
  if (doors.some((door) => typeof door.locked !== 'boolean')) throw new Error('Door locked must be true or false.');
  const triggers = sceneEntities(value, 'triggers', 50, (item, index) => {
    const action = item.action === undefined ? 'open-door' : item.action;
    if (typeof action !== 'string' || !sceneRules.has(action)) throw new Error('Trigger action is not approved.');
    return {
      id: sceneObjectId(item, 'trigger', index),
      x: sceneNumber(item, 'x', 0, -100, 100),
      y: sceneNumber(item, 'y', 0, -100, 100),
      z: sceneNumber(item, 'z', 0, -100, 100),
      width: sceneNumber(item, 'width', 2, 0.1, 100),
      height: sceneNumber(item, 'height', 2, 0.1, 100),
      depth: sceneNumber(item, 'depth', 2, 0.1, 100),
      action,
    };
  });
  const rules = sceneEntities(value, 'rules', 100, (item) => {
    if (!sceneEvents.has(item.event) || !sceneRules.has(item.action)) throw new Error('Scene rule event or action is not approved.');
    if (item.value !== undefined && typeof item.value !== 'string') throw new Error('Rule value must be text.');
    return {
      event: item.event,
      action: item.action,
      value: typeof item.value === 'string' ? item.value.trim().slice(0, 120) : '',
    };
  });
  const blueprint = normalizeBlueprint(value.blueprint, {
    objectIds: sceneObjectIds,
    doorIds: new Set(legacyDoorCount === undefined ? doors.map((door) => door.id) : []),
    nearObjectIds: new Set([...doors, ...triggers].map((item) => item.id)),
  });
  const multiplayer = value.multiplayer === undefined ? true : value.multiplayer;
  if (typeof multiplayer !== 'boolean') throw new Error('multiplayer must be true or false.');
  const doorCount = value.doorCount ?? legacyDoorCount;
  if (doorCount !== undefined && (!Number.isInteger(doorCount) || doorCount < 1 || doorCount > 100)) throw new Error('doorCount must be an integer from 1 to 100.');
  const maxPlayers = value.maxPlayers === undefined ? 4 : value.maxPlayers;
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 16) throw new Error('maxPlayers must be an integer from 1 to 16.');
  return {
    template,
    rooms,
    meshes,
    lights,
    spawns,
    doors,
    triggers,
    rules,
    blueprint,
    multiplayer,
    maxPlayers,
    ...(doorCount === undefined ? {} : { doorCount }),
  };
}

function normalizedPair(first, second) {
  return [first.toLowerCase(), second.toLowerCase()].sort();
}

function ensureWallet(username) {
  const timestamp = Date.now();
  const result = database.prepare('INSERT OR IGNORE INTO wallets (username, coins, updated_at) VALUES (?, 250, ?)').run(username, timestamp);
  if (result.changes > 0) {
    database.prepare('INSERT INTO coin_ledger (username, amount, source, reference, created_at) VALUES (?, 250, ?, ?, ?)')
      .run(username, 'welcome', 'account', timestamp);
  }
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

  const requestUrl = new URL(request.url, `http://${host}`);
  if (requestUrl.pathname === '/api/games' && request.method === 'GET') {
    const search = requestUrl.searchParams.get('q')?.trim().slice(0, 80) ?? '';
    const orderBy = requestUrl.searchParams.get('sort') === 'newest' ? 'updated_at DESC, visits DESC' : 'visits DESC, updated_at DESC';
    const rows = search
      ? database.prepare(`SELECT * FROM games WHERE status = 'published' AND (title LIKE ? OR description LIKE ?) ORDER BY ${orderBy}`).all(`%${search}%`, `%${search}%`)
      : database.prepare(`SELECT * FROM games WHERE status = 'published' ORDER BY ${orderBy}`).all();
    return sendJson(response, 200, { games: rows.map(publicGameRow) });
  }

  if (requestUrl.pathname === '/api/me/games' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const games = database.prepare('SELECT * FROM games WHERE lower(creator_username) = lower(?) ORDER BY updated_at DESC').all(session.username);
    return sendJson(response, 200, { games: games.map(publicGameRow) });
  }

  const ownedGameMatch = requestUrl.pathname.match(/^\/api\/me\/games\/([^/]+)$/);
  if (ownedGameMatch && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(decodeURIComponent(ownedGameMatch[1]));
    const game = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!game || !creatorOwnsGame(session, game)) return sendJson(response, 404, { error: 'Game not found.' });
    try {
      return sendJson(response, 200, { game: { ...publicGameRow(game), scene: safeScene(JSON.parse(game.scene_json)), rejectionReason: game.rejection_reason } });
    } catch (error) {
      return sendJson(response, 422, { error: `Saved scene needs repair: ${error.message}` });
    }
  }

  const gameMatch = request.url.match(/^\/api\/games\/([^/?]+)(?:\/(visit|submit))?$/);
  if (gameMatch && request.method === 'GET') {
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare("SELECT * FROM games WHERE slug = ? AND status = 'published'").get(slug);
    if (!row) return sendJson(response, 404, { error: 'Published game not found.' });
    let scene;
    try { scene = safeScene(JSON.parse(row.scene_json)); } catch (error) {
      return sendJson(response, 500, { error: `Published scene is invalid: ${error.message}` });
    }
    return sendJson(response, 200, { game: { ...publicGameRow(row), scene } });
  }

  const gameVersionsMatch = requestUrl.pathname.match(/^\/api\/games\/([^/]+)\/versions$/);
  if (gameVersionsMatch && request.method === 'GET') {
    const slug = normalizeSlug(decodeURIComponent(gameVersionsMatch[1]));
    const game = database.prepare('SELECT id, status, creator_username FROM games WHERE slug = ?').get(slug);
    if (!game || (game.status !== 'published' && !creatorOwnsGame(sessionFor(request), game))) return sendJson(response, 404, { error: 'Game not found.' });
    const versions = database.prepare('SELECT version, title, created_by AS creator, created_at AS createdAt FROM game_versions WHERE game_id = ? ORDER BY created_at DESC').all(game.id);
    return sendJson(response, 200, { versions });
  }

  if (gameMatch && gameMatch[2] === 'visit' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(decodeURIComponent(gameMatch[1]));
    const row = database.prepare("SELECT id, visits FROM games WHERE slug = ? AND status = 'published'").get(slug);
    if (!row) return sendJson(response, 404, { error: 'Published game not found.' });
    const timestamp = Date.now();
    const result = withTransaction(() => {
      const visit = database.prepare(`INSERT INTO game_visits (game_id, username_key, visit_day, visited_at) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, username_key, visit_day) DO NOTHING`)
        .run(row.id, session.username.toLowerCase(), dayKey(), timestamp);
      if (visit.changes > 0) {
        database.prepare('UPDATE games SET visits = visits + 1, updated_at = ? WHERE id = ?').run(timestamp, row.id);
        const credit = database.prepare('UPDATE wallets SET coins = coins + 5, updated_at = ? WHERE username = ?').run(timestamp, session.username);
        if (credit.changes > 0) {
          database.prepare('INSERT INTO coin_ledger (username, amount, source, reference, created_at) VALUES (?, 5, ?, ?, ?)')
            .run(session.username, 'verified_visit', `${row.id}:${dayKey()}`, timestamp);
        }
      }
      return visit;
    });
    const updated = database.prepare('SELECT visits FROM games WHERE id = ?').get(row.id);
    const wallet = database.prepare('SELECT coins FROM wallets WHERE username = ?').get(session.username);
    return sendJson(response, 200, { counted: result.changes > 0, visits: updated.visits, popular: updated.visits >= 1000, coins: wallet?.coins ?? 0 });
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
      if (!title) return sendJson(response, 400, { error: 'A title is required.' });
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

  const adminPreviewMatch = requestUrl.pathname.match(/^\/api\/admin\/games\/([^/]+)\/preview$/);
  if (adminPreviewMatch && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const slug = normalizeSlug(decodeURIComponent(adminPreviewMatch[1]));
    const row = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!row) return sendJson(response, 404, { error: 'Game not found.' });
    if (row.status !== 'pending') return sendJson(response, 409, { error: 'Only pending submissions can be reviewed.' });
    try {
      return sendJson(response, 200, { game: { ...publicGameRow(row), scene: safeScene(JSON.parse(row.scene_json)) } });
    } catch (error) {
      return sendJson(response, 422, { error: `Submitted scene is invalid: ${error.message}` });
    }
  }

  const adminGameMatch = request.url.match(/^\/api\/admin\/games\/([^/?]+)\/(approve|reject)$/);
  if (request.url === '/api/admin/games/pending' && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const rows = database.prepare("SELECT * FROM games WHERE status = 'pending' ORDER BY updated_at ASC").all();
    return sendJson(response, 200, { games: rows.map(publicGameRow) });
  }
  if (request.url === '/api/admin/moderation/actions' && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const actions = database.prepare('SELECT moderator, target_username AS target, action, game_slug AS gameSlug, note, created_at AS createdAt FROM moderation_actions ORDER BY created_at DESC LIMIT 200').all();
    return sendJson(response, 200, { actions });
  }
  if (adminGameMatch && request.method === 'POST') {
    const moderator = requireOwner(request, response);
    if (!moderator) return;
    const slug = normalizeSlug(decodeURIComponent(adminGameMatch[1]));
    const row = database.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
    if (!row) return sendJson(response, 404, { error: 'Game not found.' });
    if (row.status !== 'pending') return sendJson(response, 409, { error: 'Only pending submissions can be reviewed.' });
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (adminGameMatch[2] === 'approve') {
      const version = withTransaction(() => {
        const publishedVersion = publishGameVersion(row, moderator.username);
        database.prepare('INSERT INTO moderation_actions (moderator, target_username, action, game_slug, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(moderator.username, row.creator_username, 'approve_game', row.slug, note, Date.now());
        return publishedVersion;
      });
      return sendJson(response, 200, { status: 'published', version });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : note || 'Needs changes before publishing.';
    database.prepare("UPDATE games SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?").run(reason, Date.now(), row.id);
    database.prepare('INSERT INTO moderation_actions (moderator, target_username, action, game_slug, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(moderator.username, row.creator_username, 'reject_game', row.slug, reason, Date.now());
    return sendJson(response, 200, { status: 'rejected', reason });
  }

  if (request.url === '/api/friends' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const username = session.username.toLowerCase();
    const friends = database.prepare(`
      SELECT users.username
      FROM friendships AS friendship
      JOIN users
        ON lower(users.username) = CASE WHEN lower(friendship.user_a) = ? THEN lower(friendship.user_b) ELSE lower(friendship.user_a) END
      WHERE lower(friendship.user_a) = ? OR lower(friendship.user_b) = ?
      ORDER BY users.username
    `).all(username, username, username).map((friend) => {
      const online = [...sockets].find((socket) => socket.user?.toLowerCase() === friend.username.toLowerCase());
      return { ...friend, online: Boolean(online), gameSlug: online?.gameSlug ?? null };
    });
    const incoming = database.prepare("SELECT requester AS username, 'incoming' AS direction FROM friend_requests WHERE lower(recipient) = ? AND status = 'pending'").all(username);
    const outgoing = database.prepare("SELECT recipient AS username, 'outgoing' AS direction FROM friend_requests WHERE lower(requester) = ? AND status = 'pending'").all(username);
    return sendJson(response, 200, { friends, requests: [...incoming, ...outgoing] });
  }

  if (request.url === '/api/friends/request' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const targetInput = typeof body.username === 'string' ? body.username.trim() : '';
    const targetUser = targetInput ? database.prepare('SELECT username FROM users WHERE lower(username) = lower(?)').get(targetInput) : null;
    if (!targetUser || targetUser.username.toLowerCase() === session.username.toLowerCase()) return sendJson(response, 400, { error: 'Choose an existing player.' });
    const target = targetUser.username;
    const [userA, userB] = normalizedPair(session.username, target);
    if (database.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').get(userA, userB)) return sendJson(response, 409, { error: 'You are already friends.' });
    const outgoing = database.prepare("SELECT id FROM friend_requests WHERE lower(requester) = lower(?) AND lower(recipient) = lower(?) AND status = 'pending'").get(session.username, target);
    if (outgoing) return sendJson(response, 409, { error: 'A friend request is already pending.' });
    const incoming = database.prepare("SELECT id, requester, recipient FROM friend_requests WHERE lower(requester) = lower(?) AND lower(recipient) = lower(?) AND status = 'pending'").get(target, session.username);
    const timestamp = Date.now();
    if (incoming) {
      withTransaction(() => {
        database.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(userA, userB, timestamp);
        database.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?").run(timestamp, incoming.id);
      });
      return sendJson(response, 200, { status: 'accepted' });
    }
    const previousRequest = database.prepare('SELECT id FROM friend_requests WHERE lower(requester) = lower(?) AND lower(recipient) = lower(?)').get(session.username, target);
    if (previousRequest) {
      database.prepare("UPDATE friend_requests SET status = 'pending', created_at = ?, updated_at = ? WHERE id = ?")
        .run(timestamp, timestamp, previousRequest.id);
      return sendJson(response, 201, { status: 'pending' });
    }
    try {
      database.prepare('INSERT INTO friend_requests (requester, recipient, status, created_at, updated_at) VALUES (?, ?, \'pending\', ?, ?)').run(session.username, target, timestamp, timestamp);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return sendJson(response, 409, { error: 'A friend request already exists.' });
      throw error;
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
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const slug = normalizeSlug(body.slug);
    const cosmetic = database.prepare('SELECT * FROM cosmetics WHERE slug = ?').get(slug);
    if (!cosmetic) return sendJson(response, 404, { error: 'Cosmetic not found.' });
    const result = withTransaction(() => {
      ensureWallet(session.username);
      if (database.prepare('SELECT 1 FROM inventory WHERE username = ? AND cosmetic_id = ?').get(session.username, cosmetic.id)) {
        return { status: 409, error: 'Already owned.' };
      }
      const timestamp = Date.now();
      const debit = database.prepare('UPDATE wallets SET coins = coins - ?, updated_at = ? WHERE username = ? AND coins >= ?')
        .run(cosmetic.price, timestamp, session.username, cosmetic.price);
      if (debit.changes === 0) return { status: 400, error: 'Not enough coins.' };
      database.prepare('INSERT INTO inventory (username, cosmetic_id, acquired_at) VALUES (?, ?, ?)').run(session.username, cosmetic.id, timestamp);
      database.prepare('INSERT INTO coin_ledger (username, amount, source, reference, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(session.username, -cosmetic.price, 'purchase', cosmetic.slug, timestamp);
      const wallet = database.prepare('SELECT coins FROM wallets WHERE username = ?').get(session.username);
      return { status: 201, purchased: cosmetic.slug, coins: wallet.coins };
    });
    if (result.error) return sendJson(response, result.status, { error: result.error });
    const { status, ...payload } = result;
    return sendJson(response, status, payload);
  }

  if (request.url === '/api/shop/equip' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const slug = normalizeSlug(body.slug);
    const cosmetic = database.prepare('SELECT id FROM cosmetics WHERE slug = ?').get(slug);
    if (!cosmetic || !database.prepare('SELECT 1 FROM inventory WHERE username = ? AND cosmetic_id = ?').get(session.username, cosmetic.id)) return sendJson(response, 404, { error: 'Cosmetic is not in your inventory.' });
    database.prepare('UPDATE inventory SET equipped = 0 WHERE username = ?').run(session.username);
    database.prepare('UPDATE inventory SET equipped = 1 WHERE username = ? AND cosmetic_id = ?').run(session.username, cosmetic.id);
    return sendJson(response, 200, { equipped: slug });
  }

  if (requestUrl.pathname === '/api/chat/history' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const slug = normalizeSlug(requestUrl.searchParams.get('game') ?? '');
    const game = database.prepare("SELECT slug FROM games WHERE slug = ? AND status = 'published'").get(slug);
    if (!game) return sendJson(response, 404, { error: 'Published game not found.' });
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(requestUrl.searchParams.get('limit')) || 50)));
    const messages = database.prepare(`
      SELECT id AS messageId, username, text, created_at AS sentAt
      FROM chat_messages
      WHERE scope = 'game' AND scope_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM chat_blocks
          WHERE blocker = ? AND blocked = lower(chat_messages.username)
        )
      ORDER BY created_at DESC LIMIT ?
    `).all(slug, session.username.toLowerCase(), limit).reverse();
    return sendJson(response, 200, { messages });
  }

  if (request.url === '/api/chat/report' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const messageId = Number(body.messageId);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 160) : '';
    if (!Number.isInteger(messageId) || !reason) return sendJson(response, 400, { error: 'A message id and reason are required.' });
    const message = database.prepare('SELECT id FROM chat_messages WHERE id = ?').get(messageId);
    if (!message) return sendJson(response, 404, { error: 'Chat message not found.' });
    const existingReport = database.prepare('SELECT 1 FROM chat_reports WHERE message_id = ? AND lower(reporter) = lower(?)').get(messageId, session.username);
    if (existingReport) return sendJson(response, 409, { error: 'You already reported this message.' });
    database.prepare('INSERT INTO chat_reports (message_id, reporter, reason, created_at) VALUES (?, ?, ?, ?)').run(messageId, session.username, reason, Date.now());
    return sendJson(response, 201, { reported: true });
  }

  if (request.url === '/api/chat/block' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const blocked = typeof body.username === 'string' ? body.username.trim() : '';
    if (!blocked || blocked.toLowerCase() === session.username.toLowerCase()) return sendJson(response, 400, { error: 'Choose another player.' });
    const target = database.prepare('SELECT username FROM users WHERE lower(username) = lower(?)').get(blocked);
    if (!target) return sendJson(response, 404, { error: 'Player not found.' });
    database.prepare('INSERT OR IGNORE INTO chat_blocks (blocker, blocked, created_at) VALUES (?, ?, ?)').run(session.username.toLowerCase(), blocked.toLowerCase(), Date.now());
    return sendJson(response, 201, { blocked: target.username });
  }

  if (request.url === '/api/chat/blocks' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const blocks = database.prepare('SELECT users.username FROM chat_blocks JOIN users ON lower(users.username) = chat_blocks.blocked WHERE chat_blocks.blocker = ? ORDER BY users.username')
      .all(session.username.toLowerCase());
    return sendJson(response, 200, { blocks });
  }

  if (request.url === '/api/chat/unblock' && request.method === 'POST') {
    const session = requireSession(request, response);
    if (!session) return;
    const body = await readJsonOrError(request, response);
    if (!body) return;
    const blocked = typeof body.username === 'string' ? body.username.trim() : '';
    if (!blocked) return sendJson(response, 400, { error: 'Choose a player to unblock.' });
    database.prepare('DELETE FROM chat_blocks WHERE blocker = ? AND blocked = ?')
      .run(session.username.toLowerCase(), blocked.toLowerCase());
    return sendJson(response, 200, { unblocked: blocked });
  }

  if (request.url === '/api/admin/chat/reports' && request.method === 'GET') {
    if (!requireOwner(request, response)) return;
    const reports = database.prepare(`
      SELECT report.id, report.message_id AS messageId, report.reporter, report.reason,
        report.created_at AS createdAt, report.reviewed_by AS reviewedBy,
        report.reviewed_at AS reviewedAt, report.review_action AS reviewAction,
        report.review_note AS reviewNote, message.username AS messageAuthor,
        message.text AS messageText, message.scope, message.scope_id AS scopeId
      FROM chat_reports AS report
      LEFT JOIN chat_messages AS message ON message.id = report.message_id
      WHERE report.reviewed_at IS NULL
      ORDER BY report.created_at DESC LIMIT 200
    `).all();
    return sendJson(response, 200, { reports });
  }

  const reportReviewMatch = requestUrl.pathname.match(/^\/api\/admin\/chat\/reports\/(\d+)\/review$/);
  if (reportReviewMatch && request.method === 'POST') {
    const moderator = requireOwner(request, response);
    if (!moderator) return;
    const reportId = Number(reportReviewMatch[1]);
    const report = database.prepare(`
      SELECT chat_reports.id, chat_reports.reviewed_at AS reviewedAt, chat_messages.username AS messageAuthor
      FROM chat_reports LEFT JOIN chat_messages ON chat_messages.id = chat_reports.message_id
      WHERE chat_reports.id = ?
    `).get(reportId);
    if (!report) return sendJson(response, 404, { error: 'Chat report not found.' });
    if (report.reviewedAt) return sendJson(response, 409, { error: 'Chat report has already been reviewed.' });
    const body = await readJson(request);
    const decision = typeof body.decision === 'string' ? body.decision.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (!['dismiss', 'warn'].includes(decision)) return sendJson(response, 400, { error: 'Choose a supported moderation decision.' });
    const timestamp = Date.now();
    withTransaction(() => {
      database.prepare('UPDATE chat_reports SET reviewed_by = ?, reviewed_at = ?, review_action = ?, review_note = ? WHERE id = ?')
        .run(moderator.username, timestamp, decision, note, reportId);
      database.prepare('INSERT INTO moderation_actions (moderator, target_username, action, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(moderator.username, report.messageAuthor ?? 'unknown', `chat_${decision}`, note, timestamp);
    });
    return sendJson(response, 200, { reviewed: true, decision });
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
      const publishedGame = database.prepare("SELECT slug, scene_json FROM games WHERE slug = ? AND status = 'published'").get(requestedGame);
      const selectedGame = publishedGame ?? database.prepare("SELECT slug, scene_json FROM games WHERE slug = 'unknown-halls' AND status = 'published'").get();
      socket.gameSlug = selectedGame?.slug ?? 'unknown-halls';
      socket.gameMultiplayer = selectedGame ? safeScene(JSON.parse(selectedGame.scene_json)).multiplayer : true;
      socket.scenePosition = { x: 0, y: 0, z: 0, yaw: 0 };
      socket.send(JSON.stringify({ type: 'joined', username: socket.user, role: chatRole(socket.user) }));
      socket.send(JSON.stringify({ type: 'public_parties', parties: publicPartyList() }));
      broadcastPlayers();
      broadcastGamePresence(socket.gameSlug);
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

    if (message.type === 'scene_player_state') {
      if (!socket.user || !socket.gameSlug) return;
      const current = Date.now();
      const previous = gameStateRate.get(socket) ?? 0;
      if (current - previous < 80) return;
      gameStateRate.set(socket, current);
      const coordinates = [message.x, message.y, message.z, message.yaw].map(Number);
      if (!coordinates.every(Number.isFinite)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Player position must contain finite coordinates.' }));
        return;
      }
      socket.scenePosition = {
        x: Math.max(-100, Math.min(100, coordinates[0])),
        y: Math.max(0, Math.min(20, coordinates[1])),
        z: Math.max(-100, Math.min(100, coordinates[2])),
        yaw: Math.max(-Math.PI * 8, Math.min(Math.PI * 8, coordinates[3])),
      };
      broadcastGamePresence(socket.gameSlug);
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
      if (!socket.user || (!isOwnerUsername(socket.user) && !ADMIN_USERNAMES.has(socket.user.toLowerCase()))) {
        socket.send(JSON.stringify({ type: 'error', message: 'You are not allowed to promote players.' }));
        return;
      }
      const username = String(message.username ?? '').trim();
      const role = String(message.role ?? '');
      if (!username || !CHAT_ROLES.includes(role) || isOwnerUsername(username)) {
        socket.send(JSON.stringify({ type: 'error', message: `Choose a valid username and role. Owner is reserved for ${ownerUsername}.` }));
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
      if (!allowChatMessage(socket)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Please slow down before sending another message.' }));
        return;
      }
      const rawText = typeof message.text === 'string' ? message.text.trim() : '';
      const text = filterChat(rawText).slice(0, 240);
      if (!text) return;
      const payload = {
        type: 'chat',
        username: socket.user,
        role: chatRole(socket.user),
        text,
        sentAt: Date.now(),
      };
      if (socket.partyCode) {
        const stored = database.prepare('INSERT INTO chat_messages (scope, scope_id, username, text, created_at) VALUES (?, ?, ?, ?, ?)')
          .run('party', socket.partyCode, socket.user, text, payload.sentAt);
        broadcastChat(socket, { ...payload, messageId: Number(stored.lastInsertRowid) });
      }
      else {
        const gameSlug = socket.gameSlug ?? 'unknown-halls';
        const stored = database.prepare('INSERT INTO chat_messages (scope, scope_id, username, text, created_at) VALUES (\'game\', ?, ?, ?, ?)').run(gameSlug, socket.user, text, payload.sentAt);
        broadcastGameChat(gameSlug, { ...payload, type: 'game_chat', gameSlug, messageId: Number(stored.lastInsertRowid) });
      }
    }

    if (message.type === 'game_chat') {
      if (!socket.user || !socket.gameSlug) return;
      if (!allowChatMessage(socket)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Please slow down before sending another message.' }));
        return;
      }
      const current = Date.now();
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
    const disconnectedGame = socket.gameSlug;
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
    if (disconnectedGame) broadcastGamePresence(disconnectedGame);
  });
});

httpServer.listen(port, host, () => {
  console.log(`Unknown Hotel server listening on http://${host}:${port}`);
});
