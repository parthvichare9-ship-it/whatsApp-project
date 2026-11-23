const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync('library/surefy/src/config/redis.config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function load(env) {
  const exports = {};
  class Redis {
    constructor(options) { this.options = options; }
    on() {}
  }
  vm.runInNewContext(code, { exports, URL, process: { env }, console,
    require: id => {
      if (id === 'ioredis') return Redis;
      if (id === '../utils/databaseErrors') return { reportBackgroundError() {} };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  assert.equal(exports.redisConnection.options, exports.default);
  return exports.default;
}

test('Render external URL supplies TLS and decoded credentials to shared and queue connections', () => {
  const options = load({ REDIS_URL: 'rediss://render-user:p%40ss%3Aword@ohio-keyvalue.render.com:6380/2',
    REDIS_HOST: 'localhost', REDIS_PASSWORD: 'stale-password', REDIS_DB: '9' });
  assert.equal(options.host, 'ohio-keyvalue.render.com');
  assert.equal(options.port, 6380);
  assert.equal(options.username, 'render-user');
  assert.equal(options.password, 'p@ss:word');
  assert.equal(options.db, 2);
  assert.ok(options.tls);
  assert.notEqual(options.tls.rejectUnauthorized, false);
  assert.equal(options.maxRetriesPerRequest, null);
  assert.equal(options.enableReadyCheck, false);
});

test('passwordless internal URL does not inherit stale credentials or database', () => {
  const options = load({ REDIS_URL: 'redis://red-example:6379', REDIS_PASSWORD: 'stale',
    REDIS_USERNAME: 'stale', REDIS_DB: '4' });
  assert.equal(options.host, 'red-example');
  assert.equal(options.password, undefined);
  assert.equal(options.username, undefined);
  assert.equal(options.tls, undefined);
  assert.equal(options.db, 0);
});

test('separate settings still work without a hardcoded password', () => {
  const options = load({ REDIS_HOST: 'redis.internal', REDIS_PORT: '6380', REDIS_DB: '3',
    REDIS_USERNAME: 'app', REDIS_PASSWORD: 'configured-password' });
  assert.equal(options.host, 'redis.internal');
  assert.equal(options.port, 6380);
  assert.equal(options.db, 3);
  assert.equal(options.username, 'app');
  assert.equal(options.password, 'configured-password');
  assert.equal(load({ REDIS_PASSWORD: '' }).password, undefined);
  assert.equal(load({}).password, undefined);
});

test('invalid URLs fail without exposing credentials', () => {
  for (const url of ['https://user:private-password@example.com',
    'redis://user:private-password@example.com/invalid', 'rediss://user:private-password@',
    'redis://user:private-password@example.com?tls=false']) {
    assert.throws(() => load({ REDIS_URL: url }), error => {
      assert.match(error.message, /Invalid REDIS_URL/);
      assert.ok(!error.message.includes('private-password'));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
