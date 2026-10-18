import crypto from "crypto";

function readHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function requestContext(req, res, next) {
  const inbound = readHeader(req, "x-request-id");
  const requestId = typeof inbound === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(inbound)
    ? inbound
    : `req_${crypto.randomUUID()}`;

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  return next();
}

export function getRequestMeta(req) {
  return {
    requestId: req.requestId || null,
    userId: req.authUser?.id || req.auth?.user?.id || null,
    organizationId: req.organizationId || req.auth?.organizationId || null,
    role: req.auth?.role || null,
    path: String(req.originalUrl || req.url || "").split("?")[0] || null,
    method: req.method || null,
  };
}
