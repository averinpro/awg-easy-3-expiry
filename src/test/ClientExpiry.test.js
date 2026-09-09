'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ClientExpiryService } = require('../lib/ClientExpiryService');

const client = (id, expiresAt, enabled = true, networkGroup = 'guest') => ({
  id,
  name: id,
  enabled,
  expiresAt,
  networkGroup,
});

test('disables an expired enabled client', async () => {
  const calls = [];
  const now = 1_000_000;

  const store = {
    async load() {
      return {
        clients: [
          client('expired', now - 1),
          client('active', now + 60_000),
          client('forever', null),
        ],
      };
    },
  };

  const clientManager = {
    async updateClient(id, changes) {
      calls.push({ id, changes });
    },
  };

  const service = new ClientExpiryService({
    store,
    clientManager,
    now: () => now,
  });

  const result = await service.check();

  assert.deepEqual(result, ['expired']);
  assert.deepEqual(calls, [
    { id: 'expired', changes: { enabled: false } },
  ]);
});

test('does not disable active, permanent or already disabled clients', async () => {
  const calls = [];
  const now = 1_000_000;

  const store = {
    async load() {
      return {
        clients: [
          client('active', now + 60_000),
          client('forever', null),
          client('disabled', now - 1, false),
        ],
      };
    },
  };

  const clientManager = {
    async updateClient(id, changes) {
      calls.push({ id, changes });
    },
  };

  const service = new ClientExpiryService({
    store,
    clientManager,
    now: () => now,
  });

  const result = await service.check();

  assert.deepEqual(result, []);
  assert.deepEqual(calls, []);
});

test('continues checking other expired clients when one update fails', async () => {
  const calls = [];
  const errors = [];
  const now = 1_000_000;

  const store = {
    async load() {
      return {
        clients: [
          client('broken', now - 1),
          client('expired', now - 2),
        ],
      };
    },
  };

  const clientManager = {
    async updateClient(id, changes) {
      calls.push({ id, changes });
      if (id === 'broken') {
        throw new Error('LAST_HOME');
      }
    },
  };

  const service = new ClientExpiryService({
    store,
    clientManager,
    now: () => now,
    logger: {
      error(message) {
        errors.push(message);
      },
    },
  });

  const result = await service.check();

  assert.deepEqual(result, ['expired']);
  assert.deepEqual(calls, [
    { id: 'broken', changes: { enabled: false } },
    { id: 'expired', changes: { enabled: false } },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /broken/);
});

test('start performs an immediate check and schedules subsequent checks', async () => {
  const calls = [];
  const now = 1_000_000;

  const store = {
    async load() {
      return { clients: [client('expired', now - 1)] };
    },
  };

  const clientManager = {
    async updateClient(id, changes) {
      calls.push({ id, changes });
    },
  };

  const service = new ClientExpiryService({
    store,
    clientManager,
    intervalMs: 60_000,
    now: () => now,
  });

  await service.start();

  assert.equal(service.running, true);
  assert.ok(service.timer);
  assert.deepEqual(calls, [
    { id: 'expired', changes: { enabled: false } },
  ]);

  await service.stop();

  assert.equal(service.running, false);
  assert.equal(service.timer, null);
});

test('start is idempotent', async () => {
  let loads = 0;

  const service = new ClientExpiryService({
    store: {
      async load() {
        loads += 1;
        return { clients: [] };
      },
    },
    clientManager: {
      async updateClient() {},
    },
    intervalMs: 60_000,
  });

  await service.start();
  const firstTimer = service.timer;

  await service.start();

  assert.equal(service.timer, firstTimer);
  assert.equal(loads, 1);

  await service.stop();
});
