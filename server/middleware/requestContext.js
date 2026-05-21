import crypto from "crypto";

function readHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function requestContext(req, res, next) {
  const inbound = readHeader(req, "x-request-id");
  const requestId = inbound && String(inbound).trim()
    ? String(inbound).trim().slice(0, 128)
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
    path: req.originalUrl || req.url || null,
    method: req.method || null,
  };
}
