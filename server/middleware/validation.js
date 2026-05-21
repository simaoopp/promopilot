import { AppError } from "./errorHandler.js";

export function requireString(value, field, { min = 1, max = 255 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) {
    throw new AppError("VALIDATION_ERROR", `Campo inválido: ${field}.`, {
      details: { field, min, max },
    });
  }
  return text;
}

export function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || value === "") return "";
  return requireString(value, field, { min: 0, max });
}

export function requireUuid(value, field = "id") {
  const text = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new AppError("VALIDATION_ERROR", `UUID inválido: ${field}.`, { details: { field } });
  }
  return text;
}

export function parsePageQuery(query = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit || "50", 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset || "0", 10) || 0, 0);
  return { limit, offset };
}
