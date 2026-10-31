import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apiCheckOptionsFromEnv, verifyApiDeployment } from '../../scripts/verify-api-deployment.mjs';
import { normalizeApiBaseUrl } from '../../src/shared/apiBaseUrl.mjs';

const BASE = 'https://api.example.test';
const ready = () => new Response(JSON.stringify({ ok: false, error: 'Token em falta.' }), { status: 401, headers: { 'content-type': 'application/json' } });
function virtualClock(options = {}) {
  let elapsed = 0;
  const delays = [], retries = [];
  return {
    delays, retries,
    advance: ms => { elapsed += ms; },
    options: { now: () => elapsed, sleep: async ms => { delays.push(ms); elapsed += ms; }, onRetry: event => retries.push(event), ...options },
  };
}
const networkError = code => new TypeError('fetch failed', { cause: Object.assign(new Error('transport detail must remain private'), { code }) });

test('API deployment origin normalization never retains credentials or query strings', () => {
  assert.equal(normalizeApiBaseUrl('  https://api.example.test/api///  '), BASE);
  for (const url of ['https://user:secret@api.example.test', 'https://api.example.test?token=secret', 'https://api.example.test/x', 'javascript:alert(1)', 'http://api.example.test']) assert.throws(() => normalizeApiBaseUrl(url));
});

test('missing/invalid origin fails before any network request', async () => {
  let calls = 0;
  for (const base of ['', 'https://user:secret@api.example.test', 'http://api.example.test']) {
    await assert.rejects(verifyApiDeployment(base, async () => { calls++; return ready(); }));
  }
  assert.equal(calls, 0);
});

test('pre-publication check requires JSON 401 and sends no credentials or redirects', async () => {
  let signal;
  assert.deepEqual(await verifyApiDeployment(BASE, async (url, options) => {
    assert.equal(url, `${BASE}/api/access`);
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    signal = options.signal;
    return ready();
  }, { requestTimeoutMs: 20 }), { ok: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, false, 'success clears the request timeout');
});

test('old backend, SPA fallback and unprotected routes fail immediately', async () => {
  for (const status of [200, 301, 302, 307, 308, 400, 403, 404, 405]) {
    const clock = virtualClock(); let calls = 0;
    await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; return new Response('<html>wrong deployment</html>', { status }); }, clock.options), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1); assert.deepEqual(clock.delays, []);
  }
});

test('HTML, malformed JSON or an invalid JSON 401 contract never passes', async () => {
  for (const content of ['<html>not API</html>', '{', '{}', 'null', '{"ok":true,"error":"test"}', '{"ok":false}']) {
    let calls = 0;
    await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; return new Response(content, { status: 401 }); }));
    assert.equal(calls, 1);
  }
});

test('transient proxy HTTP responses can be HTML and are retried with their bodies cancelled', async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    let calls = 0, cancelled = 0;
    const clock = virtualClock();
    const result = await verifyApiDeployment(BASE, async () => {
      calls++;
      if (calls === 1) return { status, body: { cancel: async () => { cancelled++; } }, json: () => { throw new Error('proxy body must not be parsed'); } };
      return ready();
    }, clock.options);
    assert.deepEqual(result, { ok: true }); assert.equal(calls, 2); assert.equal(cancelled, 1); assert.deepEqual(clock.delays, [5000]);
  }
});

test('an API taking 65 seconds to start is tolerated within the default total deadline', async () => {
  let elapsed = 0, calls = 0;
  const delays = [];
  const result = await verifyApiDeployment(BASE, async () => { calls++; return elapsed < 65000 ? new Response('starting', { status: 503 }) : ready(); }, {
    now: () => elapsed, sleep: async ms => { elapsed += ms; delays.push(ms); },
  });
  assert.deepEqual(result, { ok: true }); assert.equal(calls, 6);
  assert.deepEqual(delays, [5000, 10000, 20000, 20000, 20000]);
  assert.equal(elapsed, 75000);
});

test('timeouts and transient socket/DNS failures retry and can recover', async () => {
  for (const firstError of [new DOMException('expired', 'TimeoutError'), ...['UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].map(networkError), new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error(), { code: 'ETIMEDOUT' })]) })]) {
    let calls = 0; const clock = virtualClock();
    assert.deepEqual(await verifyApiDeployment(BASE, async () => { if (++calls === 1) throw firstError; return ready(); }, clock.options), { ok: true });
    assert.equal(calls, 2); assert.equal(clock.retries.length, 1);
    assert.ok(!clock.retries[0].reason.includes('transport detail'));
  }
});

test('certificate failures and non-existent hosts fail without leaking transport details', async () => {
  for (const code of ['ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'ENOTFOUND']) {
    let calls = 0; const clock = virtualClock();
    await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; throw networkError(code); }, clock.options), error => /DNS.*certificado/.test(error.message) && !error.message.includes('transport detail'));
    assert.equal(calls, 1); assert.deepEqual(clock.delays, []);
  }
});

test('maximum attempts and total budget always block an unavailable API', async () => {
  const attempts = virtualClock({ maxAttempts: 3 }); let calls = 0;
  await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; return new Response('unavailable auth', { status: 503 }); }, attempts.options), /3 tentativa.*HTTP 503.*publicação foi bloqueada/);
  assert.equal(calls, 3); assert.deepEqual(attempts.delays, [5000, 10000]);
  const budget = virtualClock({ totalTimeoutMs: 6000, requestTimeoutMs: 2000, retryDelayMs: 1000, maxRetryDelayMs: 1000 }); calls = 0;
  await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; budget.advance(2000); throw new DOMException('expired', 'TimeoutError'); }, budget.options), /limite total: 6s.*timeout/);
  assert.equal(calls, 2); assert.deepEqual(budget.delays, [1000]);
});

test('an overshooting wait never starts another request after the total deadline', async () => {
  let elapsed = 0, calls = 0;
  await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; return new Response(null, { status: 503 }); }, {
    totalTimeoutMs: 1000, retryDelayMs: 10, now: () => elapsed, sleep: async () => { elapsed += 2000; },
  }), /publicação foi bloqueada/);
  assert.equal(calls, 1);
});

test('Retry-After is respected and cannot extend the overall deadline', async () => {
  let calls = 0; const clock = virtualClock();
  await verifyApiDeployment(BASE, async () => ++calls === 1 ? new Response(null, { status: 429, headers: { 'retry-after': '30' } }) : ready(), clock.options);
  assert.deepEqual(clock.delays, [30000]);
  const tooLong = virtualClock({ totalTimeoutMs: 10000 }); calls = 0;
  await assert.rejects(verifyApiDeployment(BASE, async () => { calls++; return new Response(null, { status: 503, headers: { 'retry-after': '3600' } }); }, tooLong.options), /publicação foi bloqueada/);
  assert.equal(calls, 1); assert.deepEqual(tooLong.delays, []);
});

test('timeout covers reading the body, not only waiting for response headers', async () => {
  let signal;
  await assert.rejects(verifyApiDeployment(BASE, async (_url, options) => {
    signal = options.signal;
    return { status: 401, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) };
  }, { requestTimeoutMs: 30, totalTimeoutMs: 100, maxAttempts: 1 }), /timeout.*publicação foi bloqueada/);
  assert.equal(signal.aborted, true);
});

test('environment tuning validates finite bounds before contacting the API', () => {
  assert.equal(apiCheckOptionsFromEnv({}).totalTimeoutMs, 120000);
  assert.equal(apiCheckOptionsFromEnv({ API_DEPLOYMENT_CHECK_TIMEOUT_MS: '180000' }).totalTimeoutMs, 180000);
  for (const value of ['0', '-1', '120000oops', 'Infinity', '1.5', '300001']) assert.throws(() => apiCheckOptionsFromEnv({ API_DEPLOYMENT_CHECK_TIMEOUT_MS: value }));
  assert.throws(() => apiCheckOptionsFromEnv({ API_DEPLOYMENT_CHECK_MAX_ATTEMPTS: '21' }));
});

function runCli(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../scripts/verify-api-deployment.mjs', import.meta.url))], {
      env: { ...process.env, API_DEPLOYMENT_CHECK_TIMEOUT_MS: '1000', API_DEPLOYMENT_REQUEST_TIMEOUT_MS: '500', API_DEPLOYMENT_CHECK_MAX_ATTEMPTS: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('real HTTP + CLI: valid gate exits zero, timeout/missing route/config exit nonzero', async () => {
  let mode = 'ready'; const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (mode === 'hang') { res.writeHead(401, { 'content-type': 'application/json' }); res.write('{'); return; }
    res.writeHead(mode === 'ready' ? 401 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Token missing' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const env = { REACT_APP_API_BASE_URL: `http://127.0.0.1:${server.address().port}` };
    let result = await runCli(env); assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /autenticação exigida/);
    mode = 'missing'; result = await runCli(env); assert.equal(result.code, 1); assert.match(result.stderr, /HTTP 404/);
    mode = 'hang'; result = await runCli(env); assert.equal(result.code, 1); assert.match(result.stderr, /timeout.*publicação foi bloqueada/);
    result = await runCli({ REACT_APP_API_BASE_URL: '' }); assert.equal(result.code, 1); assert.match(result.stderr, /Configure REACT_APP_API_BASE_URL/);
    assert.ok(requests.length >= 3); assert.ok(requests.every(req => req.url === '/api/access' && !req.authorization && !req.cookie));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
