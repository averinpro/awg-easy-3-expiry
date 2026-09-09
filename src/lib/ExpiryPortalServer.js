'use strict';

const http = require('node:http');

const securityHeaders = (response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  );
  response.setHeader('Cache-Control', 'no-store');
};

const normalizeAddress = (address) => {
  if (!address) return null;
  if (address.startsWith('::ffff:')) return address.slice(7);
  return address;
};

const renderExpiredPage = () => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VPN — срок действия истёк</title>
<style>
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f5f5;
  font-family: system-ui, -apple-system, sans-serif;
  color: #222;
}
main {
  max-width: 520px;
  margin: 24px;
  padding: 32px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
  text-align: center;
}
h1 {
  margin: 0 0 16px;
  font-size: 28px;
}
p {
  margin: 10px 0;
  color: #666;
  line-height: 1.5;
}
.icon {
  font-size: 48px;
  margin-bottom: 12px;
}
</style>
</head>
<body>
<main>
<div class="icon">⏳</div>
<h1>Срок действия VPN истёк</h1>
<p>Срок действия вашего VPN-доступа закончился.</p>
<p>Обратитесь к администратору для продления доступа.</p>
</main>
</body>
</html>`;

class ExpiryPortalServer {
  constructor({ store, publicAddress = '10.8.0.1' } = {}) {
    if (!store || typeof store.load !== 'function') {
      throw new TypeError('store must provide load method');
    }

    this.store = store;
    this.publicAddress = publicAddress;
    this.server = http.createServer((request, response) => {
      this.handle(request, response);
    });
  }

  async expiredAddresses() {
    const state = await this.store.load();
    if (!state) return new Set();

    const now = Date.now();

    return new Set(
      state.clients
        .filter((client) =>
          client.address4 &&
          client.expiresAt !== null &&
          client.expiresAt !== undefined &&
          Number.isFinite(client.expiresAt) &&
          client.expiresAt <= now
        )
        .map((client) => client.address4),
    );
  }

  async handle(request, response) {
    securityHeaders(response);

    if (!['GET', 'HEAD'].includes(request.method)) {
      response.statusCode = 405;
      return response.end();
    }

    const address = normalizeAddress(request.socket.remoteAddress);
    const expired = await this.expiredAddresses();

    if (!expired.has(address)) {
      response.statusCode = 404;
      return response.end();
    }

    const body = renderExpiredPage();

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(body));

    return response.end(
      request.method === 'HEAD' ? undefined : body,
    );
  }

  listen({ host = this.publicAddress, port = 51822 } = {}) {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);

      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        resolve(this.server.address());
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.server.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}

module.exports = {
  ExpiryPortalServer,
  normalizeAddress,
  renderExpiredPage,
};
