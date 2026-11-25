import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneHistory } from '../src/core/SceneHistory.js';

test('scene history undoes and redoes snapshots', () => {
  const history = new SceneHistory();
  history.record('initial');

  assert.equal(history.undo('edited'), 'initial');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo('initial'), 'edited');
  assert.equal(history.canRedo, false);
});

test('recording after undo clears redo and respects the history limit', () => {
  const history = new SceneHistory(2);
  history.record('one');
  history.record('two');
  history.record('three');

  assert.equal(history.undo('four'), 'three');
  assert.equal(history.undo('three'), 'two');
  assert.equal(history.canUndo, false);
  history.record('branch');
  assert.equal(history.canRedo, false);
});
