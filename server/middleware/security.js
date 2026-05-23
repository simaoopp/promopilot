function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function getRateLimitKey(req) {
  const userId = req.authUser?.id || req.auth?.user?.id || "";
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

function normalizePath(path = "") {
  return String(path || "").split("?")[0] || "/";
}

function pruneStore(store, now) {
  for (const [key, entry] of store.entries()) {
    if (!entry || now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export function securityHeaders(req, res, next) {
  const isProduction = process.env.NODE_ENV === "production";

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  if (isProduction || readBoolean("FORCE_HSTS", false)) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return next();
}

export function createRateLimit({
  windowMs = 15 * 60 * 1000,
  max = 300,
  label = "rate-limit",
  skip = () => false,
} = {}) {
  const store = new Map();
  const cleanupInterval = setInterval(() => pruneStore(store, Date.now()), Math.max(60_000, windowMs));
  cleanupInterval.unref?.();

  return function rateLimit(req, res, next) {
    if (skip(req)) return next();

    const now = Date.now();
    const key = `${label}:${getRateLimitKey(req)}`;
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - 1)));
      return next();
    }

    if (entry.count >= max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");

      return res.status(429).json({
        ok: false,
        error: "Demasiados pedidos. Tenta novamente mais tarde.",
        retryAfterSeconds,
      });
    }

    entry.count += 1;
    store.set(key, entry);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));

    return next();
  };
}

export const apiRateLimit = createRateLimit({
  label: "api",
  windowMs: readNumber("API_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  max: readNumber("API_RATE_LIMIT_MAX", 600),
  skip: (req) => normalizePath(req.path) === "/health" || normalizePath(req.path) === "/api/health" || normalizePath(req.path) === "/ping" || normalizePath(req.path) === "/api/ping",
});

export const adminActionRateLimit = createRateLimit({
  label: "admin-action",
  windowMs: readNumber("ADMIN_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  max: readNumber("ADMIN_RATE_LIMIT_MAX", 60),
});
