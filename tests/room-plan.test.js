import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomPlan } from '../src/world/legacyRoomGeneration.js';

test('seeded room plans remain reproducible and cover the required hotel progression', () => {
  for (let room = 0; room <= 100; room += 1) {
    const first = createRoomPlan(room, 8675309);
    const second = createRoomPlan(room, 8675309);
    assert.equal(first.roomType, second.roomType);
    assert.equal(first.variation, second.variation);
    assert.equal(first.width, second.width);
    assert.ok(first.width > 0 && first.length > 0 && first.height > 0);
    if (room >= 1 && room <= 100) assert.equal(first.roomNum, room);
  }
  assert.equal(createRoomPlan(50, 8675309).roomType, 'library');
});
