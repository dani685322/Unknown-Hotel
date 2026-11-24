import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRunData, loadSavedRun, saveRunData } from '../src/data/savedata.js';

test('run saves persist, reload, and clear independently from account data', () => {
  const values = new Map([['unknown-hotel.save-data', JSON.stringify({ account: 'HuNao' })]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const run = { mode: 'legacy', sessionSeed: 42, currentRoomNum: 50, gold: 35 };

  assert.equal(saveRunData(run), true);
  assert.deepEqual(loadSavedRun(), run);
  assert.equal(clearRunData(), true);
  assert.equal(loadSavedRun(), null);
  assert.equal(JSON.parse(values.get('unknown-hotel.save-data')).account, 'HuNao');
});

test('save helpers report when browser storage is unavailable', () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage unavailable'); },
  };

  assert.equal(saveRunData({ mode: 'legacy' }), false);
  assert.equal(clearRunData(), false);
});
