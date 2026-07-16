const OpenAI = require("openai");
const { createClient } = require("redis");
const { RedisStore } = require("rate-limit-redis");
const { createApp } = require("./app");
const { loadConfig } = require("./config");
require("dotenv").config();

async function startServer() {
  const config = loadConfig();
  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    maxRetries: 0,
  });

  let redisClient;
  let rateLimitStore;

  if (config.redisUrl) {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on("error", (error) => {
      console.error("Redis rate-limit store error:", error.message);
    });
    await redisClient.connect();
    rateLimitStore = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: "support-chat-rate-limit:",
    });
  } else if (config.nodeEnvironment === "production") {
    console.warn(
      "REDIS_URL is not configured; rate limiting will use the in-memory store."
    );
  }

  const app = createApp({
    openai,
    rateLimitStore,
    trustProxy: config.trustProxy,
    allowedOrigins: config.allowedOrigins,
  });

  const server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      if (redisClient?.isOpen) {
        await redisClient.quit();
      }
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((error) => {
  console.error("Unable to start server:", error.message);
  process.exit(1);
});
