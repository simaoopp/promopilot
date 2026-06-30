function normalizeOrigin(value = "") {
  return String(value).trim().replace(/\/+$/, "");
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "sim", "yes", "y", "on"].includes(
    String(value).toLowerCase().trim(),
  );
}

function readCsvOrigins(name) {
  return (process.env[name] || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

const PRODUCTION_DEFAULT_ALLOWED_ORIGINS = [
  "https://expertadmin.netlify.app",
  "https://promopilot.pt",
  "https://www.promopilot.pt",
];

const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8888",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8888",
  "http://127.0.0.1:5173",
];

const isProduction = process.env.NODE_ENV === "production";
const allowLocalhostCors = !isProduction || readBoolean("ALLOW_LOCALHOST_CORS", false);

export const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...PRODUCTION_DEFAULT_ALLOWED_ORIGINS,
    ...(allowLocalhostCors ? LOCAL_ALLOWED_ORIGINS : []),
    ...readCsvOrigins("CORS_ORIGINS"),
    ...readCsvOrigins("EXTRA_CORS_ORIGINS"),
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

    console.warn("[CORS] Origem bloqueada:", origin, {
      allowedOrigins: ALLOWED_ORIGINS,
    });

    return callback(new Error("Origem não autorizada."));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-Requested-With",
    "X-Request-Id",
  ],
  credentials: false,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};
