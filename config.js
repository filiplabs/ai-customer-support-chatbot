function parsePort(value) {
  const port = Number(value || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parseTrustProxy(value, nodeEnvironment) {
  if (!value) {
    return nodeEnvironment === "production" ? 1 : false;
  }

  if (value === "true") return true;
  if (value === "false") return false;

  const numericValue = Number(value);
  return Number.isInteger(numericValue) ? numericValue : value;
}

function parseAllowedOrigins(value) {
  const origins = (value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let url;

    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid ALLOWED_ORIGINS entry: ${origin}`);
    }

    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`Invalid ALLOWED_ORIGINS entry: ${origin}`);
    }
  }

  return origins;
}

function loadConfig(environment = process.env) {
  if (!environment.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  return {
    allowedOrigins: parseAllowedOrigins(environment.ALLOWED_ORIGINS),
    nodeEnvironment: environment.NODE_ENV || "development",
    openaiApiKey: environment.OPENAI_API_KEY,
    port: parsePort(environment.PORT),
    redisUrl: environment.REDIS_URL || null,
    trustProxy: parseTrustProxy(
      environment.TRUST_PROXY,
      environment.NODE_ENV
    ),
  };
}

module.exports = { loadConfig, parseAllowedOrigins, parsePort, parseTrustProxy };
