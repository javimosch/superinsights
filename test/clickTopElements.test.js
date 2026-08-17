const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getTopClickedElements } = require('../utils/clickTopElements');

function createMockEvent(rows) {
  return {
    async aggregate() {
      return rows || [];
    },
  };
}

describe('getTopClickedElements', () => {
  it('returns top clicked selectors sorted by count and limited', async () => {
    const Event = createMockEvent([
      { selector: '#btn-hero', count: 5 },
      { selector: 'a.btn', count: 3 },
      { selector: '#cta-start', count: 8 },
    ]);

    const match = { projectId: 'abc', eventName: '$click' };
    const result = await getTopClickedElements({ Event, match, limit: 2 });

    assert.deepEqual(result, [
      { selector: '#cta-start', count: 8 },
      { selector: '#btn-hero', count: 5 },
    ]);
  });

  it('caps the default limit at 5', async () => {
    const rows = [];
    for (let i = 0; i < 10; i += 1) {
      rows.push({ selector: `sel-${i}`, count: i + 1 });
    }

    const Event = createMockEvent(rows);
    const result = await getTopClickedElements({ Event, match: {} });

    assert.strictEqual(result.length, 5);
    assert.strictEqual(result[0].count, 10);
  });

  it('rejects an invalid Event model', async () => {
    await assert.rejects(
      () => getTopClickedElements({ Event: null, match: {} }),
      /Event model with aggregate method is required/
    );
  });

  it('coerces selector and count types', async () => {
    const Event = createMockEvent([
      { selector: 123, count: '7' },
    ]);

    const result = await getTopClickedElements({ Event, match: {} });

    assert.strictEqual(result[0].selector, '123');
    assert.strictEqual(result[0].count, 7);
  });
});
