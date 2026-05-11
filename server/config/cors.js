function normalizeOrigin(value = "") {
  return String(value).trim().replace(/\/+$/, "");
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://expertadmin.netlify.app",
  "http://localhost:3000",
  "http://localhost:8888",
];

export const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean),
  ]),
);

export const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.error("[CORS] Origem bloqueada:", origin);
    console.error("[CORS] Permitidas:", ALLOWED_ORIGINS);

    return callback(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};
