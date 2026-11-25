export const BLUEPRINT_LIMITS = Object.freeze({
  nodes: 100,
  edges: 200,
  animations: 50,
  stepsPerEvent: 100,
});

export const BLUEPRINT_NODE_TYPES = Object.freeze({
  'event-enter': {
    title: 'On Enter',
    category: 'Events',
    inputs: {},
    outputs: { exec: 'exec' },
  },
  'event-interact': {
    title: 'On Interact',
    category: 'Events',
    inputs: {},
    outputs: { exec: 'exec' },
  },
  'condition-door-locked': {
    title: 'Door Is Locked?',
    category: 'Conditions',
    inputs: {},
    outputs: { value: 'boolean' },
  },
  'condition-player-near-object': {
    title: 'Player Near Object?',
    category: 'Conditions',
    inputs: {},
    outputs: { value: 'boolean' },
  },
  branch: {
    title: 'Branch',
    category: 'Flow',
    inputs: { exec: 'exec', condition: 'boolean' },
    outputs: { true: 'exec', false: 'exec' },
  },
  'action-open-door': {
    title: 'Open Nearby Door',
    category: 'Actions',
    inputs: { exec: 'exec' },
    outputs: { exec: 'exec' },
  },
  'action-show-message': {
    title: 'Show Message',
    category: 'Actions',
    inputs: { exec: 'exec' },
    outputs: { exec: 'exec' },
  },
  'action-complete': {
    title: 'Complete Area',
    category: 'Actions',
    inputs: { exec: 'exec' },
    outputs: { exec: 'exec' },
  },
  'action-toggle-light': {
    title: 'Toggle Lights',
    category: 'Actions',
    inputs: { exec: 'exec' },
    outputs: { exec: 'exec' },
  },
  'action-play-animation': {
    title: 'Play Animation',
    category: 'Actions',
    inputs: { exec: 'exec' },
    outputs: { exec: 'exec' },
  },
});

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const ROOT_KEYS = new Set(['version', 'nodes', 'edges']);
const NODE_KEYS = new Set(['id', 'type', 'x', 'y', 'properties']);
const EDGE_KEYS = new Set(['from', 'to']);
const POINT_KEYS = new Set(['nodeId', 'pin']);
const ANIMATION_KEYS = new Set(['id', 'name', 'targetId', 'durationMs', 'easing', 'loop', 'to']);
const EASINGS = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out']);
const TRANSFORM_KEYS = new Set(['position', 'rotation', 'scale']);

function assertKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${label} property "${unknown}" is not supported.`);
}

function assertId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error(`${label} must be a short identifier.`);
  return value;
}

function boundedNumber(value, fallback, min, max, label) {
  const number = value === undefined ? fallback : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
  return number;
}

function normalizePoint(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a pin reference.`);
  assertKeys(value, POINT_KEYS, label);
  return {
    nodeId: assertId(value.nodeId, `${label} node id`),
    pin: assertId(value.pin, `${label} pin`),
  };
}

function normalizeNodeProperties(type, value, { objectIds, doorIds, nearObjectIds, animationIds }) {
  if (value === undefined) value = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Blueprint node properties must be an object.');
  const properties = {};
  const targetTypes = new Set(['condition-door-locked', 'condition-player-near-object']);
  if (targetTypes.has(type)) {
    assertKeys(value, new Set(['targetId']), 'Blueprint node');
    const targetId = value.targetId === undefined || value.targetId === '' ? '' : assertId(value.targetId, 'Blueprint target id');
    const targetSet = type === 'condition-door-locked' ? doorIds ?? objectIds : nearObjectIds ?? objectIds;
    if (targetId && targetSet && !targetSet.has(targetId)) throw new Error('Blueprint references an incompatible or missing scene object.');
    properties.targetId = targetId;
  } else if (type === 'action-show-message' || type === 'action-complete') {
    assertKeys(value, new Set(['value']), 'Blueprint node');
    const text = value.value === undefined ? '' : value.value;
    if (typeof text !== 'string' || text.length > 120) throw new Error('Blueprint message must be text no longer than 120 characters.');
    properties.value = text;
  } else if (type === 'action-play-animation') {
    assertKeys(value, new Set(['animationId']), 'Blueprint node');
    const animationId = value.animationId === undefined || value.animationId === '' ? '' : assertId(value.animationId, 'Blueprint animation id');
    if (animationId && animationIds && !animationIds.has(animationId)) throw new Error('Blueprint references an animation that does not exist.');
    properties.animationId = animationId;
  } else {
    assertKeys(value, new Set(), 'Blueprint node');
  }
  return properties;
}

function pinType(node, direction, pin) {
  return BLUEPRINT_NODE_TYPES[node.type][direction][pin];
}

function validateFlowAcyclic(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach(({ from, to }) => {
    if (pinType(nodes.find((node) => node.id === from.nodeId), 'outputs', from.pin) === 'exec') {
      adjacency.get(from.nodeId).push(to.nodeId);
    }
  });
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error('Blueprint flow connections cannot contain a loop.');
    if (visited.has(id)) return;
    visiting.add(id);
    adjacency.get(id).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  adjacency.forEach((_, id) => visit(id));
}

export function normalizeBlueprint(value, references = {}) {
  if (value === undefined) return { version: 1, nodes: [], edges: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Blueprint graph must be an object.');
  assertKeys(value, ROOT_KEYS, 'Blueprint');
  if (value.version !== undefined && value.version !== 1) throw new Error('Blueprint graph version is not supported.');
  if (!Array.isArray(value.nodes) || value.nodes.length > BLUEPRINT_LIMITS.nodes) throw new Error(`Blueprint must contain at most ${BLUEPRINT_LIMITS.nodes} nodes.`);
  if (!Array.isArray(value.edges) || value.edges.length > BLUEPRINT_LIMITS.edges) throw new Error(`Blueprint must contain at most ${BLUEPRINT_LIMITS.edges} connections.`);

  const nodeIds = new Set();
  const nodes = value.nodes.map((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`Blueprint node ${index + 1} must be an object.`);
    assertKeys(node, NODE_KEYS, 'Blueprint node');
    const id = assertId(node.id, 'Blueprint node id');
    if (nodeIds.has(id)) throw new Error('Blueprint node ids must be unique.');
    nodeIds.add(id);
    if (typeof node.type !== 'string' || !BLUEPRINT_NODE_TYPES[node.type]) throw new Error('Blueprint node type is not approved.');
    return {
      id,
      type: node.type,
      x: boundedNumber(node.x, 40 + (index % 4) * 240, -5000, 5000, 'Blueprint node x'),
      y: boundedNumber(node.y, 40 + Math.floor(index / 4) * 150, -5000, 5000, 'Blueprint node y'),
      properties: normalizeNodeProperties(node.type, node.properties, references),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const occupiedInputs = new Set();
  const edgeKeys = new Set();
  const edges = value.edges.map((edge, index) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) throw new Error(`Blueprint connection ${index + 1} must be an object.`);
    assertKeys(edge, EDGE_KEYS, 'Blueprint connection');
    const from = normalizePoint(edge.from, 'Blueprint connection source');
    const to = normalizePoint(edge.to, 'Blueprint connection target');
    const sourceNode = nodeById.get(from.nodeId);
    const targetNode = nodeById.get(to.nodeId);
    if (!sourceNode || !targetNode) throw new Error('Blueprint connection references a missing node.');
    const sourceType = pinType(sourceNode, 'outputs', from.pin);
    const targetType = pinType(targetNode, 'inputs', to.pin);
    if (!sourceType || !targetType || sourceType !== targetType) throw new Error('Blueprint connection pins are incompatible.');
    const inputKey = `${to.nodeId}:${to.pin}`;
    if (occupiedInputs.has(inputKey)) throw new Error('Blueprint input pins can have only one connection.');
    occupiedInputs.add(inputKey);
    const edgeKey = `${from.nodeId}:${from.pin}>${to.nodeId}:${to.pin}`;
    if (edgeKeys.has(edgeKey)) throw new Error('Blueprint connections must be unique.');
    edgeKeys.add(edgeKey);
    return { from, to };
  });
  validateFlowAcyclic(nodes, edges);
  return { version: 1, nodes, edges };
}

function normalizeVector(value, label, min, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a vector.`);
  assertKeys(value, new Set(['x', 'y', 'z']), label);
  return {
    x: boundedNumber(value.x, 0, min, max, `${label} x`),
    y: boundedNumber(value.y, 0, min, max, `${label} y`),
    z: boundedNumber(value.z, 0, min, max, `${label} z`),
  };
}

export function normalizeAnimations(value, { objectIds } = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > BLUEPRINT_LIMITS.animations) {
    throw new Error(`Animations must contain at most ${BLUEPRINT_LIMITS.animations} tracks.`);
  }
  const ids = new Set();
  return value.map((animation, index) => {
    if (!animation || typeof animation !== 'object' || Array.isArray(animation)) throw new Error(`Animation ${index + 1} must be an object.`);
    assertKeys(animation, ANIMATION_KEYS, 'Animation');
    const id = assertId(animation.id, 'Animation id');
    if (ids.has(id)) throw new Error('Animation ids must be unique.');
    ids.add(id);
    if (typeof animation.name !== 'string' || !animation.name.trim() || animation.name.length > 48) throw new Error('Animation name must contain 1 to 48 characters.');
    const targetId = assertId(animation.targetId, 'Animation target id');
    if (objectIds && !objectIds.has(targetId)) throw new Error('Animation target scene object does not exist.');
    const durationMs = boundedNumber(animation.durationMs, 1000, 100, 30000, 'Animation duration');
    if (typeof animation.easing !== 'string' || !EASINGS.has(animation.easing)) throw new Error('Animation easing is not approved.');
    if (typeof animation.loop !== 'boolean') throw new Error('Animation loop must be true or false.');
    if (!animation.to || typeof animation.to !== 'object' || Array.isArray(animation.to)) throw new Error('Animation target transform must be an object.');
    assertKeys(animation.to, TRANSFORM_KEYS, 'Animation transform');
    const to = {};
    if (animation.to.position !== undefined) to.position = normalizeVector(animation.to.position, 'Animation position', -100, 100);
    if (animation.to.rotation !== undefined) to.rotation = normalizeVector(animation.to.rotation, 'Animation rotation', -Math.PI, Math.PI);
    if (animation.to.scale !== undefined) to.scale = normalizeVector(animation.to.scale, 'Animation scale', 0.1, 10);
    if (!Object.keys(to).length) throw new Error('Animation must change at least one transform.');
    return {
      id,
      name: animation.name.trim(),
      targetId,
      durationMs,
      easing: animation.easing,
      loop: animation.loop,
      to,
    };
  });
}

export function getAnimationProgress(animation, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  const duration = animation.durationMs;
  let progress = elapsed / duration;
  if (animation.loop) {
    const cycle = Math.floor(progress);
    progress %= 1;
    if (cycle % 2 === 1) progress = 1 - progress;
  } else {
    progress = Math.min(1, progress);
  }
  if (animation.easing === 'ease-in') progress *= progress;
  else if (animation.easing === 'ease-out') progress = 1 - (1 - progress) ** 2;
  else if (animation.easing === 'ease-in-out') {
    progress = progress < 0.5
      ? 2 * progress ** 2
      : 1 - ((-2 * progress + 2) ** 2) / 2;
  }
  return {
    progress,
    finished: !animation.loop && elapsed >= duration,
  };
}

export function runBlueprintEvent(blueprint, eventName, context) {
  const nodes = new Map(blueprint.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Map();
  blueprint.edges.forEach((edge) => {
    const outKey = `${edge.from.nodeId}:${edge.from.pin}`;
    const inKey = `${edge.to.nodeId}:${edge.to.pin}`;
    outgoing.set(outKey, [...(outgoing.get(outKey) ?? []), edge.to.nodeId]);
    incoming.set(inKey, edge.from.nodeId);
  });
  const queue = blueprint.nodes
    .filter((node) => node.type === `event-${eventName}`)
    .flatMap((node) => outgoing.get(`${node.id}:exec`) ?? []);
  let steps = 0;
  while (queue.length && steps < BLUEPRINT_LIMITS.stepsPerEvent) {
    const nodeId = queue.shift();
    const node = nodes.get(nodeId);
    if (!node) continue;
    steps += 1;
    if (node.type === 'branch') {
      const conditionId = incoming.get(`${node.id}:condition`);
      const condition = nodes.get(conditionId);
      const result = condition ? Boolean(context.evaluateCondition(condition)) : false;
      queue.push(...(outgoing.get(`${node.id}:${result ? 'true' : 'false'}`) ?? []));
      continue;
    }
    if (node.type.startsWith('action-')) context.executeAction(node);
    queue.push(...(outgoing.get(`${node.id}:exec`) ?? []));
  }
  return { steps, limitReached: queue.length > 0 };
}
