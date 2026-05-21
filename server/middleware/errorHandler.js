import { getRequestMeta } from "./requestContext.js";

const STATUS_BY_CODE = new Map([
  ["AUTH_REQUIRED", 401],
  ["FORBIDDEN", 403],
  ["NOT_FOUND", 404],
  ["VALIDATION_ERROR", 400],
  ["RATE_LIMITED", 429],
  ["TENANT_REQUIRED", 403],
]);

export class AppError extends Error {
  constructor(code, message, { status, details } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code || "INTERNAL_ERROR";
    this.status = status || STATUS_BY_CODE.get(this.code) || 500;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Recurso não encontrado.",
      requestId: req.requestId || null,
    },
  });
}

export function errorHandler(error, req, res, _next) {
  const status = Number(error?.status || error?.statusCode || 500);
  const code = error?.code || (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
  const isServerError = status >= 500;
  const meta = getRequestMeta(req);

  const safeMessage = isServerError
    ? "Erro interno. A equipa técnica foi notificada."
    : error?.message || "Pedido inválido.";

  const logPayload = {
    ...meta,
    status,
    code,
    message: error?.message,
    stack: isServerError ? error?.stack : undefined,
  };

  if (isServerError) {
    console.error("[api:error]", logPayload);
  } else {
    console.warn("[api:warn]", logPayload);
  }

  return res.status(status).json({
    ok: false,
    error: {
      code,
      message: safeMessage,
      requestId: req.requestId || null,
      details: isServerError ? undefined : error?.details,
    },
  });
}
