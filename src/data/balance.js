// src/data/balance.js — single source of truth for tuning
export const SPEED = {
  walk: 3.2,
  sprint: 6.5,
  crouch: 1.6,
};

export const STAMINA = {
  max: 100,
  drain: -18,   // per second while sprinting
  regen: 11,    // per second while not sprinting
};

// 0 = silent, 1 = full sprint
export const NOISE = {
  idle: 0,
  crouch: 0,
  walk: 0.5,
  sprint: 1.0,
};

export const HEALTH = {
  max: 100,
  screechZap: 15,
};

// probability table, rolled once per door opening
export const ENTITY_SPAWN = {
  Rush:   { minDoor: 5,  maxDoor: 99, p: 0.18, cooldown: 14 },
  Ambush: { minDoor: 20, maxDoor: 99, p: 0.09, cooldown: 20 },
  Screech:{ minDoor: 3,  maxDoor: 100, p: 0.25, cooldown: 8 },
  Figure: { minDoor: 50, maxDoor: 50, p: 1.00, cooldown: 0 },
};

// difficulty ramp applied after minDoor
export const DIFFICULTY = {
  perDoor: 0.015,  // +1.5%
  cap: 1.6,
};
