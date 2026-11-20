// src/world/roomGen.js — Phase 4: seeded PRNG + linear 100-room chain
// Linear (Doors-style), NOT a maze: room N is reached only through door N.

/* ------------------------------------------------------------- PRNG */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------- archetypes */
export const ARCHETYPES = {
  corridor:        { weight: 30, minW: 3,  maxW: 4.5, minL: 20, maxL: 46, lit: 0.90 },
  suite:           { weight: 26, minW: 8,  maxW: 14,  minL: 12, maxL: 26, lit: 0.70 },
  blackout:        { weight: 16, minW: 4,  maxW: 10,  minL: 18, maxL: 36, lit: 0.00 },
  closet_gauntlet: { weight: 14, minW: 5,  maxW: 9,   minL: 24, maxL: 44, lit: 0.35 },
  figure_lair:     { weight: 1,  minW: 8,  maxW: 12,  minL: 30, maxL: 40, lit: 0.15 },
  garden:          { weight: 1,  minW: 12, maxW: 18,  minL: 36, maxL: 46, lit: 0.55 },
};

export const ROOM_COUNT = 100;
export const FIGURE_DOOR = 50;
export const FINAL_DOOR = 100;

/* ------------------------------------------------------------ helpers */
const randRange = (rand, a, b) => a + rand() * (b - a);
const randInt   = (rand, a, b) => Math.floor(randRange(rand, a, b + 1));

function pickArchetype(rand) {
  const entries = Object.entries(ARCHETYPES);
  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let roll = rand() * total;
  for (const [name, cfg] of entries) {
    roll -= cfg.weight;
    if (roll <= 0) return name;
  }
  return 'corridor';
}

export const roomLabel = (n) => `Room ${String(n).padStart(3, '0')}`;

/* ---------------------------------------------------------- room build */
function makeRoom(rand, index) {
  // forced archetypes
  let archetype;
  if (index === FIGURE_DOOR) archetype = 'figure_lair';
  else if (index === FINAL_DOOR) archetype = 'garden';
  else archetype = pickArchetype(rand);

  const cfg = ARCHETYPES[archetype];

  const width  = +randRange(rand, cfg.minW, cfg.maxW).toFixed(2);
  const length = +randRange(rand, cfg.minL, cfg.maxL).toFixed(2);
  const height = archetype === 'garden' ? 6 : 3;

  // lighting: a room that should be lit may still fail its roll
  const lit = rand() < cfg.lit;

  // locking: every 5th door needs a key, others have a 15% chance of a code
  let lock = { type: 'none' };
  if (index > 1) {
    if (index % 5 === 0) {
      lock = { type: 'key' };
    } else if (rand() < 0.15) {
      lock = { type: 'code', code: String(randInt(rand, 1000, 9999)) };
    }
  }

  // hiding spots exist in every room; blackouts have the most
  const hidingSpots =
    archetype === 'blackout' ? randInt(rand, 3, 5)
    : archetype === 'suite'  ? randInt(rand, 2, 4)
    : randInt(rand, 1, 2);

  return {
    index,
    label: roomLabel(index),
    archetype,
    width,
    length,
    height,
    lit,
    lock,
    hidingSpots,
    sideRooms: randInt(rand, 1, 3),
    seedOffset: randInt(rand, 1, 1e6), // per-room decoration seed
  };
}

/* ------------------------------------------------------------- run gen */
export function generateRun(seed, count = ROOM_COUNT) {
  const requestedCount = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : ROOM_COUNT;
  count = Math.max(1, Math.min(ROOM_COUNT, requestedCount));
  const rand = mulberry32(seed);

  const rooms = [];
  for (let i = 1; i <= count; i++) rooms.push(makeRoom(rand, i));

  // guarantee the boss doors exist exactly once
  if (rooms[FIGURE_DOOR - 1]) rooms[FIGURE_DOOR - 1].archetype = 'figure_lair';
  if (rooms[FINAL_DOOR - 1]) rooms[FINAL_DOOR - 1].archetype = 'garden';

  return {
    seed,
    count,
    rooms,
    get: (n) => rooms[n - 1] ?? null,
  };
}

export default generateRun;
