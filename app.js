const express = require("express");
const path = require("node:path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const MAX_USER_MESSAGE_LENGTH = 500;
const MAX_ASSISTANT_MESSAGE_LENGTH = 4000;
const MAX_REQUEST_MESSAGES = 100;
const MAX_TOTAL_CONTENT_LENGTH = 30000;
const MAX_CONTEXT_MESSAGES = 11;
const MAX_OUTPUT_TOKENS = 300;
const OPENAI_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_REQUESTS = 5;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Conversation messages are required.";
  }

  if (messages.length > MAX_REQUEST_MESSAGES) {
    return "Conversation is too long.";
  }

  let totalContentLength = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const expectedRole = index % 2 === 0 ? "user" : "assistant";

    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      message.role !== expectedRole ||
      typeof message.content !== "string"
    ) {
      return "Conversation messages are invalid.";
    }

    const contentLength = message.content.trim().length;
    const maximumLength =
      message.role === "user"
        ? MAX_USER_MESSAGE_LENGTH
        : MAX_ASSISTANT_MESSAGE_LENGTH;

    if (contentLength === 0 || message.content.length > maximumLength) {
      return message.role === "user"
        ? "Message must be between 1 and 500 characters."
        : "Conversation messages are invalid.";
    }

    totalContentLength += message.content.length;
  }

  if (
    messages[messages.length - 1].role !== "user" ||
    totalContentLength > MAX_TOTAL_CONTENT_LENGTH
  ) {
    return "Conversation messages are invalid.";
  }

  return null;
}

function selectRecentContext(messages) {
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

function createOriginMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.get("origin");

    if (!origin) {
      return next();
    }

    const requestOrigin = `${req.protocol}://${req.get("host")}`;

    if (origin !== requestOrigin && !allowed.has(origin)) {
      return res.status(403).json({ error: "Origin is not allowed." });
    }

    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.sendStatus(204);
    }

    return next();
  };
}

function createConcurrencyLimiter(maximumConcurrentRequests) {
  let activeRequests = 0;

  return (req, res, next) => {
    if (activeRequests >= maximumConcurrentRequests) {
      return res.status(503).json({ error: "Unable to generate a response." });
    }

    activeRequests += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeRequests -= 1;
      }
    };

    res.once("finish", release);
    res.once("close", release);
    return next();
  };
}

function createApp({
  openai,
  rateLimitStore,
  trustProxy = false,
  allowedOrigins = [],
} = {}) {
  if (!openai) {
    throw new Error("An OpenAI client is required.");
  }

  const app = express();

  if (trustProxy !== false) {
    app.set("trust proxy", trustProxy);
  }

  const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        "Too many requests. Please wait a few minutes before trying again.",
    },
    ...(rateLimitStore ? { store: rateLimitStore } : {}),
  });

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(createOriginMiddleware(allowedOrigins));
  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(path.join(__dirname, "public")));
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use(
    "/chat",
    chatLimiter,
    createConcurrencyLimiter(MAX_CONCURRENT_REQUESTS)
  );

  app.post("/chat", async (req, res) => {
    try {
      const messages = req.body?.messages;
      const validationError = validateMessages(messages);

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const controller = new AbortController();
      const abortUpstreamRequest = () => {
        if (!res.writableEnded) {
          controller.abort();
        }
      };
      res.once("close", abortUpstreamRequest);

      const response = await openai.responses.create(
        {
          model: "gpt-5-mini",
          instructions:
            "You are a helpful customer support assistant for an online store. Answer briefly, clearly, and professionally. If you do not know something, recommend contacting a human support agent.",
          input: selectRecentContext(messages),
          max_output_tokens: MAX_OUTPUT_TOKENS,
        },
        { timeout: OPENAI_TIMEOUT_MS, signal: controller.signal }
      );

      res.off("close", abortUpstreamRequest);

      if (typeof response.output_text !== "string" || !response.output_text) {
        throw new Error("OpenAI returned an empty response.");
      }

      return res.json({ reply: response.output_text });
    } catch (error) {
      console.error("Chat request failed", {
        name: error?.name,
        status: error?.status,
        requestId: error?.request_id,
      });

      const status = error?.status === 429 ? 429 : 500;
      return res.status(status).json({ error: "Unable to generate a response." });
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof SyntaxError || error?.type === "entity.too.large") {
      const status = error?.type === "entity.too.large" ? 413 : 400;
      return res.status(status).json({ error: "Invalid request body." });
    }

    console.error("Unhandled request error", { name: error?.name });
    return res.status(500).json({ error: "Unable to generate a response." });
  });

  return app;
}

module.exports = {
  createApp,
  selectRecentContext,
  validateMessages,
  MAX_CONTEXT_MESSAGES,
  MAX_OUTPUT_TOKENS,
  OPENAI_TIMEOUT_MS,
  MAX_CONCURRENT_REQUESTS,
};
