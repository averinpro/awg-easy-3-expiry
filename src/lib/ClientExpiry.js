'use strict';

const isExpired = (expiresAt, now = Date.now()) => (
  expiresAt !== null
  && expiresAt !== undefined
  && Number.isFinite(expiresAt)
  && expiresAt <= now
);

const normalizeExpiresAt = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const timestamp = Number(value);

  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new TypeError('expiresAt must be a positive Unix timestamp in milliseconds or null');
  }

  return timestamp;
};

const expiredClientIds = (clients, now = Date.now()) => (
  clients
    .filter((client) => client.enabled && isExpired(client.expiresAt, now))
    .map((client) => client.id)
);

module.exports = {
  isExpired,
  normalizeExpiresAt,
  expiredClientIds,
};
