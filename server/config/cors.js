function normalizeOrigin(value = "") {
  return String(value).trim().replace(/\/+$/, "");
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

const PRODUCTION_DEFAULT_ALLOWED_ORIGINS = [
  "https://expertadmin.netlify.app",
];

const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8888",
];

const isProduction = process.env.NODE_ENV === "production";
const allowLocalhostCors = !isProduction || readBoolean("ALLOW_LOCALHOST_CORS", false);

export const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...PRODUCTION_DEFAULT_ALLOWED_ORIGINS,
    ...(allowLocalhostCors ? LOCAL_ALLOWED_ORIGINS : []),
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

    console.warn("[CORS] Origem bloqueada:", origin);

    return callback(new Error("Origem não autorizada."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};
