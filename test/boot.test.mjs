import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// Run the real entry point in a subprocess with mocked dependencies. A live
// dashboard handle reproduces the bug where logging the error alone never exits.
const harness = `
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const scenario = process.argv[1];
let dashboard;
class Client {
  async login() {
    if (scenario === 'timeout') {
      throw new Error('Connect Timeout Error (attempted address: discord.com:443, timeout: 10000ms)');
    }
    if (scenario === 'invalid-token') throw new Error('An invalid token was provided.');
    clearInterval(dashboard);
    return 'mock-token';
  }
}
const mocks = {
  'dotenv/config': {},
  'discord.js': {
    Client,
    GatewayIntentBits: { Guilds: 1, GuildVoiceStates: 2 },
    Collection: Map,
  },
  fs: { readdirSync: () => [] },
  path: { dirname, join },
  url: { fileURLToPath },
  '../db/database.js': { initDatabase() {} },
  './player/setup.js': {
    async setupPlayer() {
      if (scenario === 'setup-failure') throw new Error('Player setup failed');
      return {};
    },
  },
  '../web/server.js': {
    startWebServer() {
      console.log('[Test] Dashboard started');
      dashboard = setInterval(() => {}, 1000);
    },
  },
};
const entry = new URL('../src/bot/index.js', ${JSON.stringify(import.meta.url)});
const module = new SourceTextModule(readFileSync(entry, 'utf8'), {
  initializeImportMeta(meta) { meta.url = entry.href; },
});
await module.link(specifier => {
  if (!(specifier in mocks)) throw new Error('Unexpected import: ' + specifier);
  const exports = mocks[specifier];
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  });
});
await module.evaluate();
`;

function boot(scenario) {
  const result = spawnSync(process.execPath, [
    '--experimental-vm-modules', '--input-type=module', '-e', harness, scenario,
  ], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      DISCORD_TOKEN: 'mock-token',
      CLIENT_ID: 'mock-client',
      DASHBOARD_PASSWORD: 'test-only',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

for (const [scenario, message] of [
  ['timeout', 'Connect Timeout Error'],
  ['invalid-token', 'An invalid token was provided.'],
]) {
  test(`${scenario}: exits nonzero even with the dashboard running`, () => {
    const result = boot(scenario);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[Test\] Dashboard started/);
    assert.match(result.stderr, /\[Boot\] Discord login failed:/);
    assert.match(result.stderr, /\[Boot\] Fatal error:/);
    assert.ok(result.stderr.includes(message));
    assert.doesNotMatch(result.stderr, /fix your DISCORD_TOKEN/);
  });
}

test('successful login completes without a fatal error', () => {
  const result = boot('success');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[Test\] Dashboard started/);
  assert.match(result.stdout, /\[Boot\] Discord client logged in/);
  assert.doesNotMatch(result.stderr, /\[Boot\].*(?:failed|Fatal error)/);
});

test('player setup failures still exit nonzero before starting the dashboard', () => {
  const result = boot('setup-failure');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[Boot\] Fatal error:.*Player setup failed/);
  assert.doesNotMatch(result.stdout, /\[Test\] Dashboard started/);
});
