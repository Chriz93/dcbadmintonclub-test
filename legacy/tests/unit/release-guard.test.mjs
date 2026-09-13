import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = new vm.Script('(async()=>{' + readFileSync(new URL('../../scripts/check-test-release.mjs', import.meta.url), 'utf8') + '})()');
const credentials = { GITHUB_REPOSITORY: 'Chriz93/dcbadmintonclub-test', TEST_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-release-key' };
const run = (env, reply, requests = []) => script.runInNewContext({
  process: { env }, AbortSignal, console: { log() {} },
  fetch: async (url, options) => { requests.push({ url, options }); return reply; },
});
const response = (rows, status = 200) => new Response(JSON.stringify(rows), { status });

for (const [label, env, message] of [
  ['production repository', { ...credentials, GITHUB_REPOSITORY: 'Chriz93/dcbadmintonclub' }, /Only the TEST repository/],
  ['missing TEST credential', { GITHUB_REPOSITORY: credentials.GITHUB_REPOSITORY }, /repository secret/],
]) test(`release guard · ${label} stops before any request`, async () => {
  const requests = [];
  await assert.rejects(run(env, response([]), requests), message);
  assert.equal(requests.length, 0);
});

for (const [label, rows] of [
  ['production database marker', [{ name: 'production', schema_version: 'L24' }]],
  ['old schema', [{ name: 'test', schema_version: 'L23' }]],
  ['missing marker', []],
  ['ambiguous markers', [{ name: 'test', schema_version: 'L24' }, { name: 'test', schema_version: 'L24' }]],
]) test(`release guard · rejects ${label}`, async () => {
  await assert.rejects(run(credentials, response(rows)), /Apply and verify TEST migrations/);
});

test('release guard · a refused read fails without exposing credentials', async () => {
  await assert.rejects(run(credentials, response({}, 403)), e => {
    assert.match(e.message, /HTTP 403/);
    assert.equal(e.message.includes(credentials.TEST_SUPABASE_SERVICE_ROLE_KEY), false);
    return true;
  });
});

test('release guard · a ready TEST schema performs exactly one fixed read', async () => {
  const requests = [];
  await run(credentials, response([{ name: 'test', schema_version: 'L24' }]), requests);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://wgolevihkvmosajumzvl.supabase.co/rest/v1/environment?select=name,schema_version');
  assert.equal(requests[0].options.method, undefined);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer synthetic-release-key');
});
