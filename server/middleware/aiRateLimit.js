const AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AI_RATE_LIMIT_MAX_REQUESTS = 20;
const aiRateLimitStore = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function aiRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const entry = aiRateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    aiRateLimitStore.set(ip, {
      count: 1,
      resetAt: now + AI_RATE_LIMIT_WINDOW_MS,
    });

    return next();
  }

  if (entry.count >= AI_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("Retry-After", String(retryAfterSeconds));

    return res.status(429).json({
      ok: false,
      error: "Demasiados pedidos. Tenta novamente mais tarde.",
      retryAfterSeconds,
    });
  }

  entry.count += 1;
  aiRateLimitStore.set(ip, entry);

  return next();
}

export function startAiRateLimitCleanup() {
  return setInterval(
    () => {
      const now = Date.now();

      for (const [ip, entry] of aiRateLimitStore.entries()) {
        if (now > entry.resetAt) {
          aiRateLimitStore.delete(ip);
        }
      }
    },
    5 * 60 * 1000,
  );
}
