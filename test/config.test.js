const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  loadConfig,
  parseAllowedOrigins,
  parsePort,
  parseTrustProxy,
} = require("../config");

test("loads production configuration with safe proxy defaults", () => {
  const config = loadConfig({
    OPENAI_API_KEY: "test-key",
    NODE_ENV: "production",
    PORT: "8080",
    ALLOWED_ORIGINS: "https://support.example, https://admin.example",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.trustProxy, 1);
  assert.deepEqual(config.allowedOrigins, [
    "https://support.example",
    "https://admin.example",
  ]);
});

test("rejects missing required configuration", () => {
  assert.throws(() => loadConfig({}), /OPENAI_API_KEY is required/);
  assert.throws(() => parsePort("70000"), /PORT/);
  assert.throws(
    () => parseAllowedOrigins("not-a-url"),
    /Invalid ALLOWED_ORIGINS/
  );
});

test("parses explicit proxy settings", () => {
  assert.equal(parseTrustProxy("false", "production"), false);
  assert.equal(parseTrustProxy("2", "production"), 2);
  assert.equal(parseTrustProxy("loopback", "production"), "loopback");
});
