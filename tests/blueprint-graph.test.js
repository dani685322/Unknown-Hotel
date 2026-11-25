import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnimationProgress, normalizeAnimations, normalizeBlueprint, runBlueprintEvent } from '../src/core/BlueprintGraph.js';

const graph = {
  version: 1,
  nodes: [
    { id: 'enter', type: 'event-enter', x: 0, y: 0 },
    { id: 'locked', type: 'condition-door-locked', x: 220, y: 0, properties: { targetId: 'door-1' } },
    { id: 'branch', type: 'branch', x: 440, y: 0 },
    { id: 'open', type: 'action-open-door', x: 660, y: 0 },
  ],
  edges: [
    { from: { nodeId: 'enter', pin: 'exec' }, to: { nodeId: 'branch', pin: 'exec' } },
    { from: { nodeId: 'locked', pin: 'value' }, to: { nodeId: 'branch', pin: 'condition' } },
    { from: { nodeId: 'branch', pin: 'true' }, to: { nodeId: 'open', pin: 'exec' } },
  ],
};

test('normalizes event, condition, branch, and action connections with scene references', () => {
  const normalized = normalizeBlueprint(graph, { objectIds: new Set(['door-1']), doorIds: new Set(['door-1']) });
  assert.equal(normalized.nodes.length, 4);
  assert.deepEqual(normalized.edges[1].to, { nodeId: 'branch', pin: 'condition' });
});

test('allows incomplete condition and animation nodes while editing a draft', () => {
  const normalized = normalizeBlueprint({
    version: 1,
    nodes: [
      { id: 'condition', type: 'condition-door-locked', properties: { targetId: '' } },
      { id: 'animation', type: 'action-play-animation', properties: { animationId: '' } },
    ],
    edges: [],
  });
  assert.equal(normalized.nodes[0].properties.targetId, '');
  assert.equal(normalized.nodes[1].properties.animationId, '');
});

test('rejects incompatible, cyclic, and missing-object connections', () => {
  assert.throws(() => normalizeBlueprint({
    ...graph,
    edges: [{ from: { nodeId: 'enter', pin: 'exec' }, to: { nodeId: 'locked', pin: 'value' } }],
  }), /incompatible/);
  assert.throws(() => normalizeBlueprint({
    version: 1,
    nodes: [
      { id: 'one', type: 'action-open-door' },
      { id: 'two', type: 'action-complete' },
    ],
    edges: [
      { from: { nodeId: 'one', pin: 'exec' }, to: { nodeId: 'two', pin: 'exec' } },
      { from: { nodeId: 'two', pin: 'exec' }, to: { nodeId: 'one', pin: 'exec' } },
    ],
  }), /loop/);
  assert.throws(() => normalizeBlueprint(graph, { doorIds: new Set(['other-door']) }), /scene object/);
});

test('runs the true branch for a locked door and ignores the false branch', () => {
  const actions = [];
  const result = runBlueprintEvent(graph, 'enter', {
    evaluateCondition: () => true,
    executeAction: (node) => actions.push(node.type),
  });
  assert.equal(result.limitReached, false);
  assert.deepEqual(actions, ['action-open-door']);
});

test('normalizes bounded transform animations and rejects unknown targets', () => {
  const animation = {
    id: 'open-door',
    name: 'Open Door',
    targetId: 'door-1',
    durationMs: 1200,
    easing: 'ease-out',
    loop: false,
    to: { rotation: { x: 0, y: 1.2, z: 0 } },
  };
  assert.equal(normalizeAnimations([animation], { objectIds: new Set(['door-1']) })[0].durationMs, 1200);
  assert.throws(() => normalizeAnimations([{ ...animation, durationMs: 60 }], { objectIds: new Set(['door-1']) }), /duration/);
  assert.throws(() => normalizeAnimations([animation], { objectIds: new Set(['mesh-1']) }), /target scene object/);
});

test('animates with bounded easing and ping-pong looping', () => {
  const animation = { durationMs: 1000, easing: 'ease-out', loop: false };
  assert.deepEqual(getAnimationProgress(animation, 500), { progress: 0.75, finished: false });
  assert.deepEqual(getAnimationProgress(animation, 1200), { progress: 1, finished: true });
  assert.deepEqual(getAnimationProgress({ ...animation, loop: true }, 1250), { progress: 0.9375, finished: false });
});
