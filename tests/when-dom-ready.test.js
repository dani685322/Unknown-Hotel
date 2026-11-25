import test from 'node:test';
import assert from 'node:assert/strict';
import { whenDomReady } from '../src/core/whenDomReady.js';

test('waits for DOMContentLoaded while the document is loading', () => {
  let eventName;
  let listener;
  let options;
  let calls = 0;
  const document = {
    readyState: 'loading',
    addEventListener(name, callback, listenerOptions) {
      eventName = name;
      listener = callback;
      options = listenerOptions;
    },
  };

  whenDomReady(document, () => { calls += 1; });

  assert.equal(calls, 0);
  assert.equal(eventName, 'DOMContentLoaded');
  assert.deepEqual(options, { once: true });
  listener();
  assert.equal(calls, 1);
});

test('runs immediately when the document is already ready', () => {
  let calls = 0;
  const document = {
    readyState: 'complete',
    addEventListener() { assert.fail('should not register a late DOMContentLoaded listener'); },
  };

  whenDomReady(document, () => { calls += 1; });

  assert.equal(calls, 1);
});
