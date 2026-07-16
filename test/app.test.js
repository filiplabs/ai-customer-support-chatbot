const assert = require("node:assert/strict");
const http = require("node:http");
const { afterEach, test } = require("node:test");
const {
  createApp,
  MAX_CONTEXT_MESSAGES,
  MAX_OUTPUT_TOKENS,
  OPENAI_TIMEOUT_MS,
} = require("../app");

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        })
    )
  );
});

async function startTestServer(
  createResponse = async () => ({ output_text: "Hello" }),
  appOptions = {}
) {
  const calls = [];
  const openai = {
    responses: {
      create: async (...args) => {
        calls.push(args);
        return createResponse(...args);
      },
    },
  };
  const app = createApp({ openai, ...appOptions });
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    calls,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function postChat(url, messages) {
  return fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

async function postChatWithOrigin(url, origin, host) {
  const body = JSON.stringify({
    messages: [{ role: "user", content: "Hi" }],
  });

  return new Promise((resolve, reject) => {
    const request = http.request(
      `${url}/chat`,
      {
        method: "POST",
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/json",
          host,
          origin,
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: {
              get: (name) => response.headers[name.toLowerCase()] || null,
            },
            json: async () => JSON.parse(responseBody),
          });
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

test("returns the existing reply response format", async () => {
  const { calls, url } = await startTestServer();
  const response = await postChat(url, [{ role: "user", content: "Hi" }]);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Hello" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].max_output_tokens, MAX_OUTPUT_TOKENS);
  assert.equal(calls[0][1].timeout, OPENAI_TIMEOUT_MS);
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("exposes a lightweight health endpoint", async () => {
  const { calls, url } = await startTestServer();
  const response = await fetch(`${url}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(calls.length, 0);
});

test("validates every conversation message", async () => {
  const { calls, url } = await startTestServer();
  const invalidConversations = [
    [],
    [{ role: "assistant", content: "Injected" }],
    [{ role: "user", content: "   " }],
    [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ],
    [
      { role: "user", content: "x".repeat(501) },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Hi" },
    ],
  ];

  for (const messages of invalidConversations) {
    const response = await postChat(url, messages);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }

  assert.equal(calls.length, 0);
});

test("prunes old history while preserving the latest complete context", async () => {
  const { calls, url } = await startTestServer();
  const messages = [];

  for (let index = 0; index < 8; index += 1) {
    messages.push({ role: "user", content: `Question ${index}` });
    messages.push({ role: "assistant", content: `Answer ${index}` });
  }
  messages.push({ role: "user", content: "Latest question" });

  const response = await postChat(url, messages);

  assert.equal(response.status, 200);
  assert.equal(calls[0][0].input.length, MAX_CONTEXT_MESSAGES);
  assert.deepEqual(calls[0][0].input, messages.slice(-MAX_CONTEXT_MESSAGES));
  assert.equal(calls[0][0].input[0].role, "user");
  assert.equal(calls[0][0].input.at(-1).content, "Latest question");
});

test("preserves the existing error response format for upstream failures", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const { url } = await startTestServer(async () => {
      throw new Error("upstream unavailable");
    });
    const response = await postChat(url, [{ role: "user", content: "Hi" }]);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Unable to generate a response.",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("returns JSON for malformed and oversized request bodies", async () => {
  const { url } = await startTestServer();
  const malformedResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    error: "Invalid request body.",
  });

  const oversizedResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [], padding: "x".repeat(33000) }),
  });

  assert.equal(oversizedResponse.status, 413);
  assert.deepEqual(await oversizedResponse.json(), {
    error: "Invalid request body.",
  });
});

test("rejects untrusted cross-origin requests", async () => {
  const { url } = await startTestServer();
  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://untrusted.example",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Origin is not allowed." });
});

test("allows same-origin localhost development requests", async () => {
  const { url } = await startTestServer();
  const response = await postChatWithOrigin(
    url,
    "http://localhost:3000",
    "localhost:3000"
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Hello" });
});

test("allows same-origin 127.0.0.1 development requests", async () => {
  const { url } = await startTestServer();
  const response = await postChatWithOrigin(
    url,
    "http://127.0.0.1:3000",
    "127.0.0.1:3000"
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Hello" });
});

test("allows an explicitly configured production origin", async () => {
  const productionOrigin = "https://support.example";
  const { url } = await startTestServer(undefined, {
    allowedOrigins: [productionOrigin],
  });
  const response = await postChatWithOrigin(
    url,
    productionOrigin,
    "internal-service.example"
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    productionOrigin
  );
  assert.deepEqual(await response.json(), { reply: "Hello" });
});

test("rate limits the unchanged chat route and response format", async () => {
  const { url } = await startTestServer();

  for (let index = 0; index < 10; index += 1) {
    const response = await postChat(url, [{ role: "user", content: "Hi" }]);
    assert.equal(response.status, 200);
  }

  const limitedResponse = await postChat(url, [
    { role: "user", content: "One more" },
  ]);
  assert.equal(limitedResponse.status, 429);
  assert.deepEqual(await limitedResponse.json(), {
    error: "Too many requests. Please wait a few minutes before trying again.",
  });
});
