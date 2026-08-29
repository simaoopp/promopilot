const AI_RATE_LIMIT_WINDOW_MS = Math.max(
  60_000,
  Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
);
const AI_RATE_LIMIT_MAX_REQUESTS = Math.max(
  10,
  Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 60),
);
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
  const userId = String(req.authUser?.id || req.auth?.user?.id || "").trim();
  const key = userId ? `user:${userId}` : `ip:${ip}`;
  const entry = aiRateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    aiRateLimitStore.set(key, {
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
  aiRateLimitStore.set(key, entry);

  return next();
}

export function startAiRateLimitCleanup() {
  return setInterval(
    () => {
      const now = Date.now();

      for (const [key, entry] of aiRateLimitStore.entries()) {
        if (now > entry.resetAt) {
          aiRateLimitStore.delete(key);
        }
      }
    },
    5 * 60 * 1000,
  );
}
