import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGeneratedReplies } from './chat-utils.js';

test('salvages partial JSON chat batches from truncated model output', () => {
  const result = parseGeneratedReplies('[{"speaker":"Nova","text":"I\'m so excited to"}', 3);

  assert.deepEqual(result, [{ speaker: 'Nova', text: "I'm so excited to" }]);
});
