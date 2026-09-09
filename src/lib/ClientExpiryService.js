'use strict';

const { expiredClientIds } = require('./ClientExpiry');

class ClientExpiryService {
  constructor({
    store,
    clientManager,
    intervalMs = 60 * 1000,
    now = () => Date.now(),
    logger = console,
  } = {}) {
    if (!store || typeof store.load !== 'function') {
      throw new TypeError('store must provide load method');
    }
    if (!clientManager || typeof clientManager.updateClient !== 'function') {
      throw new TypeError('clientManager must provide updateClient');
    }
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
      throw new TypeError('intervalMs must be a positive integer');
    }
    if (typeof now !== 'function') {
      throw new TypeError('now must be a function');
    }

    this.store = store;
    this.clientManager = clientManager;
    this.intervalMs = intervalMs;
    this.now = now;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  async check() {
    const state = await this.store.load();
    if (!state) return [];

    const ids = expiredClientIds(state.clients, this.now());
    const disabled = [];

    for (const clientId of ids) {
      try {
        await this.clientManager.updateClient(clientId, { enabled: false });
        disabled.push(clientId);
      } catch (error) {
        this.logger.error?.(
          `Failed to disable expired client ${clientId}: ${error.message}`,
        );
      }
    }

    return disabled;
  }

  async start() {
    if (this.running) return;

    this.running = true;

    await this.check();

    this.timer = setInterval(() => {
      this.check().catch((error) => {
        this.logger.error?.(`Client expiry check failed: ${error.message}`);
      });
    }, this.intervalMs);

    this.timer.unref?.();
  }

  async stop() {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  ClientExpiryService,
};
