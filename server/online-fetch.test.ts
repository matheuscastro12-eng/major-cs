import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLobby, type LobbyState } from '../src/state/online';

const lobbyState = (host: string): LobbyState => ({
  lobby: {
    code: 'CACHE',
    mode: 'party',
    host,
    status: 'waiting',
    seed: 123,
    pool: 'world',
  },
  players: [{
    nick: host,
    picks: [],
    coach_pick: '',
    done: false,
  }],
  serverNow: Date.now(),
});

test('lobby ETag is only reused when the current screen already has a snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<RequestInit | undefined> = [];
  let call = 0;

  globalThis.fetch = async (_input, init) => {
    requests.push(init);
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify(lobbyState('host-one')), {
        status: 200,
        headers: { ETag: 'W/"room-v1"', 'Content-Type': 'application/json' },
      });
    }
    if (call === 2) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(lobbyState('host-two')), {
      status: 200,
      headers: { ETag: 'W/"room-v2"', 'Content-Type': 'application/json' },
    });
  };

  try {
    const first = await fetchLobby('CACHE', false);
    assert.notEqual(first, 'unchanged');
    assert.equal(typeof first === 'object' && first?.lobby.host, 'host-one');

    const unchanged = await fetchLobby('CACHE', true);
    assert.equal(unchanged, 'unchanged');
    assert.deepEqual(requests[1]?.headers, { 'If-None-Match': 'W/"room-v1"' });

    const afterRemount = await fetchLobby('CACHE', false);
    assert.notEqual(afterRemount, 'unchanged');
    assert.equal(typeof afterRemount === 'object' && afterRemount?.lobby.host, 'host-two');
    assert.equal(requests[2]?.headers, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
