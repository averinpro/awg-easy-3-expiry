'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  ExpiryPortalServer,
  normalizeAddress,
  renderExpiredPage,
} = require('../lib/ExpiryPortalServer');

test('normalizeAddress handles IPv4-mapped IPv6', () => {
  assert.equal(normalizeAddress('::ffff:10.8.0.2'), '10.8.0.2');
  assert.equal(normalizeAddress('10.8.0.2'), '10.8.0.2');
});

test('renderExpiredPage contains expiration message', () => {
  const html = renderExpiredPage();

  assert.match(html, /Срок действия VPN истёк/);
  assert.match(html, /Обратитесь к администратору/);
});

test('portal returns page for expired client', async () => {
  const store = {
    async load() {
      return {
        clients: [
          {
            id: 'expired',
            address4: '127.0.0.1',
            expiresAt: Date.now() - 1000,
            enabled: false,
          },
        ],
      };
    },
  };

  const portal = new ExpiryPortalServer({
    store,
    publicAddress: '127.0.0.1',
  });

  await portal.listen({ host: '127.0.0.1', port: 0 });

  const address = portal.server.address();

  const response = await new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1',
      port: address.port,
      path: '/',
    }, resolve);

    request.on('error', reject);
  });

  let body = '';

  for await (const chunk of response) {
    body += chunk;
  }

  assert.equal(response.statusCode, 200);
  assert.match(body, /Срок действия VPN истёк/);
  assert.equal(response.headers['cache-control'], 'no-store');

  await portal.close();
});

test('portal rejects active client', async () => {
  const store = {
    async load() {
      return {
        clients: [
          {
            id: 'active',
            address4: '127.0.0.1',
            expiresAt: Date.now() + 3600000,
            enabled: true,
          },
        ],
      };
    },
  };

  const portal = new ExpiryPortalServer({
    store,
    publicAddress: '127.0.0.1',
  });

  await portal.listen({ host: '127.0.0.1', port: 0 });

  const address = portal.server.address();

  const response = await new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1',
      port: address.port,
      path: '/',
    }, resolve);

    request.on('error', reject);
  });

  response.resume();

  assert.equal(response.statusCode, 404);

  await portal.close();
});
