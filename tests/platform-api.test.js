import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import test, { after, before } from 'node:test';
import WebSocket from 'ws';

const ownerPassword = randomBytes(32).toString('base64url');
const alicePassword = randomBytes(24).toString('base64url');
const bobPassword = randomBytes(24).toString('base64url');
const charliePassword = randomBytes(24).toString('base64url');
let baseUrl;
let websocketUrl;
let tempDirectory;
let serverProcess;
let serverEnv;
let serverStderr = '';

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer() {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  websocketUrl = `ws://127.0.0.1:${port}/ws`;
  serverEnv = {
    ...process.env,
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: String(port),
    DATABASE_PATH: join(tempDirectory, 'platform.sqlite'),
    OWNER_USERNAME: 'HuNao',
    OWNER_PASSWORD: ownerPassword,
  };
  serverProcess = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: serverEnv, stdio: ['ignore', 'ignore', 'pipe'] });
  serverStderr = '';
  serverProcess.stderr.on('data', (chunk) => { serverStderr += chunk.toString(); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`API server exited during startup: ${serverStderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* Wait for the listener to become ready. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not start: ${serverStderr}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const processToStop = serverProcess;
  processToStop.kill('SIGTERM');
  await once(processToStop, 'exit');
  serverProcess = null;
}

async function api(path, { token, method = 'GET', body } = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  } catch (error) {
    throw new Error(`${method} ${path} failed: ${error.message}\n${serverStderr}`, { cause: error });
  }
}

function connectPlayer(token, gameSlug) {
  const socket = new WebSocket(websocketUrl);
  const messages = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  const waitFor = (predicate, timeout = 3000) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for a WebSocket message.'));
        }, timeout),
      };
      waiters.push(waiter);
    });
  };
  const connected = new Promise((resolve, reject) => {
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'join', token, gameSlug }));
      waitFor((message) => message.type === 'joined').then(resolve, reject);
    });
    socket.once('error', reject);
  });
  return { socket, waitFor, connected };
}

before(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'unknown-halls-test-'));
  await startServer();
});

after(async () => {
  await stopServer();
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
});

test('auth, ownership, approval, visits, friends, scene safety, chat, and moderation work end to end', async () => {
  const ownerLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'HuNao', password: ownerPassword } });
  assert.equal(ownerLogin.status, 200);
  assert.equal(ownerLogin.data.role, 'owner');
  const ownerToken = ownerLogin.data.token;

  const aliceRegister = await api('/api/auth/register', { method: 'POST', body: { username: 'Alice', password: alicePassword } });
  const bobRegister = await api('/api/auth/register', { method: 'POST', body: { username: 'Bob', password: bobPassword } });
  const charlieRegister = await api('/api/auth/register', { method: 'POST', body: { username: 'Charlie', password: charliePassword } });
  assert.equal(aliceRegister.status, 201);
  assert.equal(bobRegister.status, 201);
  assert.equal(charlieRegister.status, 201);
  const alice = aliceRegister.data.token;
  const bob = bobRegister.data.token;
  const charlie = charlieRegister.data.token;

  assert.equal((await api('/api/games', { method: 'POST', body: { title: 'No auth' } })).status, 401);
  const invalidScene = await api('/api/games', {
    token: alice,
    method: 'POST',
    body: { title: 'Invalid scene', slug: 'invalid-scene', scene: { template: 'corridor', scripts: ['run()'] } },
  });
  assert.equal(invalidScene.status, 400);
  const invalidMaterial = await api('/api/games', {
    token: alice,
    method: 'POST',
    body: { title: 'Invalid material', slug: 'invalid-material', scene: { template: 'corridor', meshes: [{ material: 'external-url' }] } },
  });
  assert.equal(invalidMaterial.status, 400);
  const invalidBlueprint = await api('/api/games', {
    token: alice,
    method: 'POST',
    body: {
      title: 'Invalid blueprint',
      slug: 'invalid-blueprint',
      scene: { template: 'corridor', blueprint: { version: 1, nodes: [{ id: 'bad', type: 'run-script' }], edges: [] } },
    },
  });
  assert.equal(invalidBlueprint.status, 400);
  const validBlueprint = await api('/api/games', {
    token: alice,
    method: 'POST',
    body: {
      title: 'Event Graph',
      slug: 'event-graph',
      scene: {
        template: 'corridor',
        doors: [{ id: 'door-main', locked: true }],
        blueprint: {
          version: 1,
          nodes: [
            { id: 'start', type: 'event-interact' },
            { id: 'locked', type: 'condition-door-locked', properties: { targetId: 'door-main' } },
            { id: 'branch', type: 'branch' },
            { id: 'message', type: 'action-show-message', properties: { value: 'Locked!' } },
          ],
          edges: [
            { from: { nodeId: 'start', pin: 'exec' }, to: { nodeId: 'branch', pin: 'exec' } },
            { from: { nodeId: 'locked', pin: 'value' }, to: { nodeId: 'branch', pin: 'condition' } },
            { from: { nodeId: 'branch', pin: 'true' }, to: { nodeId: 'message', pin: 'exec' } },
          ],
        },
      },
    },
  });
  assert.equal(validBlueprint.status, 201);
  const savedBlueprint = await api('/api/me/games/event-graph', { token: alice });
  assert.equal(savedBlueprint.data.game.scene.blueprint.nodes.length, 4);
  assert.equal(savedBlueprint.data.game.scene.doors[0].id, 'door-main');

  const created = await api('/api/games', {
    token: alice,
    method: 'POST',
    body: {
      title: 'Brass Passage',
      slug: 'brass-passage',
      description: 'An original corridor exploration.',
      scene: {
        template: 'corridor',
        rooms: [{ x: 0, y: 0, z: 0, width: 14, height: 4, depth: 20, material: 'wood' }],
        meshes: [{ x: 1, y: 0, z: 2, width: 1, height: 2, depth: 1, material: 'brass' }],
        lights: [{ x: 0, y: 3, z: 0, color: '#ffc76b', intensity: 1, distance: 18 }],
        spawns: [{ x: 0, y: 0, z: 6 }],
        doors: [],
        triggers: [],
        rules: [],
        multiplayer: true,
        maxPlayers: 4,
      },
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.game.status, 'draft');
  assert.equal((await api('/api/games?sort=newest')).data.games.some((game) => game.slug === 'brass-passage'), false);
  assert.equal((await api('/api/me/games/brass-passage', { token: bob })).status, 404);
  assert.equal((await api('/api/games/brass-passage', { token: bob, method: 'PATCH', body: { title: 'Hijack' } })).status, 404);
  assert.equal((await api('/api/admin/games/pending', { token: alice })).status, 403);

  const submit = await api('/api/games/brass-passage/submit', { token: alice, method: 'POST' });
  assert.equal(submit.status, 200);
  const preview = await api('/api/admin/games/brass-passage/preview', { token: ownerToken });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.game.scene.meshes.length, 1);
  const approval = await api('/api/admin/games/brass-passage/approve', { token: ownerToken, method: 'POST', body: { note: 'Original scene approved.' } });
  assert.equal(approval.status, 200);
  assert.equal(approval.data.status, 'published');
  assert.equal((await api('/api/games/brass-passage/versions')).data.versions.length, 1);
  assert.equal((await api('/api/admin/games/brass-passage/approve', { token: ownerToken, method: 'POST' })).status, 409);

  const firstVisit = await api('/api/games/brass-passage/visit', { token: alice, method: 'POST' });
  const secondVisit = await api('/api/games/brass-passage/visit', { token: alice, method: 'POST' });
  assert.equal(firstVisit.data.counted, true);
  assert.equal(secondVisit.data.counted, false);
  assert.equal(secondVisit.data.visits, 1);
  assert.equal(secondVisit.data.coins, 255);

  assert.equal((await api('/api/friends/request', { token: alice, method: 'POST', body: { username: 'bOB' } })).status, 201);
  assert.equal((await api('/api/friends/request', { token: bob, method: 'POST', body: { username: 'Alice' } })).data.status, 'accepted');
  assert.equal((await api('/api/friends', { token: alice })).data.friends[0].username, 'Bob');
  assert.equal((await api('/api/friends/request', { token: alice, method: 'POST', body: { username: 'Bob' } })).status, 409);
  const malformedFriendRequest = await fetch(`${baseUrl}/api/friends/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${alice}`, 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(malformedFriendRequest.status, 400);
  assert.equal((await api('/api/friends/request', { token: charlie, method: 'POST', body: { username: 'Alice' } })).status, 201);
  assert.equal((await api('/api/friends/Charlie/decline', { token: alice, method: 'POST' })).data.status, 'declined');
  assert.equal((await api('/api/friends/request', { token: charlie, method: 'POST', body: { username: 'Alice' } })).status, 201);
  assert.equal((await api('/api/friends/Charlie/accept', { token: alice, method: 'POST' })).data.status, 'accepted');

  const aliceSocket = connectPlayer(alice, 'brass-passage');
  const bobSocket = connectPlayer(bob, 'brass-passage');
  try {
    await Promise.all([aliceSocket.connected, bobSocket.connected]);
    const onlineFriends = await api('/api/friends', { token: alice });
    assert.equal(onlineFriends.data.friends[0].online, true);
    assert.equal(onlineFriends.data.friends[0].gameSlug, 'brass-passage');

    bobSocket.socket.send(JSON.stringify({ type: 'game_chat', text: 'You are a whore https://example.com' }));
    const filteredMessage = await aliceSocket.waitFor((message) => message.type === 'game_chat');
    assert.match(filteredMessage.text, /\*{5}/);
    assert.doesNotMatch(filteredMessage.text, /https?:/);
    assert.equal((await api('/api/chat/history?game=brass-passage', { token: alice })).data.messages.length, 1);
    assert.equal((await api('/api/chat/report', { token: alice, method: 'POST', body: { messageId: filteredMessage.messageId, reason: 'Inappropriate chat.' } })).status, 201);
    assert.equal((await api('/api/chat/report', { token: alice, method: 'POST', body: { messageId: filteredMessage.messageId, reason: 'Duplicate report.' } })).status, 409);
    assert.equal((await api('/api/admin/chat/reports', { token: ownerToken })).data.reports[0].messageAuthor, 'Bob');
    assert.equal((await api(`/api/admin/chat/reports/${(await api('/api/admin/chat/reports', { token: ownerToken })).data.reports[0].id}/review`, { token: ownerToken, method: 'POST', body: { decision: 'warn', note: 'Keep chat respectful.' } })).status, 200);
    assert.equal((await api('/api/admin/moderation/actions', { token: ownerToken })).data.actions[0].action, 'chat_warn');

    bobSocket.socket.send(JSON.stringify({ type: 'scene_player_state', x: 2, y: 0, z: -4, yaw: 1 }));
    const presence = await aliceSocket.waitFor((message) => message.type === 'game_players' && message.players.some((player) => player.username === 'Bob' && player.x === 2));
    assert.equal(presence.players.length, 2);

    assert.equal((await api('/api/chat/block', { token: alice, method: 'POST', body: { username: 'Bob' } })).status, 201);
    assert.equal((await api('/api/chat/history?game=brass-passage', { token: alice })).data.messages.length, 0);

    assert.equal((await api('/api/shop/purchase', { token: alice, method: 'POST', body: { slug: 'brass-lantern' } })).status, 201);
    assert.equal((await api('/api/shop/purchase', { token: alice, method: 'POST', body: { slug: 'brass-lantern' } })).status, 409);
    assert.equal((await api('/api/shop/equip', { token: alice, method: 'POST', body: { slug: 'brass-lantern' } })).status, 200);
    assert.equal((await api('/api/inventory', { token: alice })).data.items[0].equipped, 1);
  } finally {
    aliceSocket.socket.close();
    bobSocket.socket.close();
  }

  await stopServer();
  await startServer();
  assert.equal((await api('/api/games/brass-passage')).status, 200);
  const restoredOwner = await api('/api/auth/login', { method: 'POST', body: { username: 'HuNao', password: ownerPassword } });
  assert.equal(restoredOwner.status, 200);
  assert.equal((await api('/api/admin/check', { token: restoredOwner.data.token })).status, 200);
});
