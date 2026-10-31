import { AppError } from "../middleware/errorHandler.js";
import { requireUuid } from "../middleware/validation.js";
import {
  userRpc,
  requirePermission,
} from "../services/platform/accessService.js";
import {
  LIMITS,
  validateConfig,
} from "../../src/shared/campaign-import/model.js";

const actions = new Set([
  "templates",
  "template_save",
  "sessions",
  "start",
  "read",
  "batch",
  "edit",
  "exclude_invalid",
  "finalize",
]);
export function validateImportRequest(action, data) {
  const invalid = (message) => {
    throw new AppError("VALIDATION_ERROR", message);
  };
  if (!actions.has(action)) invalid("Operação de importação inválida.");
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== "object" ||
    Buffer.byteLength(JSON.stringify(data)) > 1100000
  )
    invalid("Pedido de importação demasiado grande.");
  if (
    "organizationId" in data ||
    "organization_id" in data ||
    "storeId" in data ||
    "before_cents" in data
  )
    invalid("A organização e o preço anterior são obtidos pelo servidor.");
  if (!["templates", "template_save", "sessions"].includes(action))
    requireUuid(data.id);
  if (action === "template_save" && data.id) requireUuid(data.id);
  if (["start", "template_save"].includes(action)) {
    try {
      validateConfig(data.config);
    } catch (error) {
      invalid(error.message);
    }
  }
  if (
    action === "start" &&
    (!Number.isInteger(data.totalRows) ||
      data.totalRows < 1 ||
      data.totalRows > LIMITS.rows ||
      !/^[a-f0-9]{64}$/.test(data.source?.hash || ""))
  )
    invalid("Origem ou número de linhas inválido.");
  if (action === "batch") {
    if (
      !Number.isInteger(data.offset) ||
      data.offset < 0 ||
      !Array.isArray(data.rows) ||
      !data.rows.length ||
      data.rows.length > LIMITS.batch
    )
      invalid("Lote inválido.");
    for (const row of data.rows) {
      if (
        !Array.isArray(row?.raw) ||
        row.raw.length > LIMITS.columns ||
        row.raw.some(
          (cell) => typeof cell !== "string" || cell.length > LIMITS.cellLength,
        ) ||
        (row.flags !== undefined &&
          (!Array.isArray(row.flags) ||
            row.flags.length > LIMITS.columns ||
            row.flags.some(
              (flag) => typeof flag !== "string" || flag.length > 200,
            )))
      )
        invalid("Células ou avisos inválidos.");
    }
  }
  if (
    action === "edit" &&
    (!Number.isInteger(data.rowIndex) ||
      data.rowIndex < 0 ||
      data.rowIndex >= LIMITS.rows)
  )
    invalid("Linha inválida.");
  if (
    ["edit", "exclude_invalid", "finalize"].includes(action) &&
    (!Number.isInteger(data.version) || data.version < 1)
  )
    invalid("Atualize a revisão antes de continuar.");
  if (
    data.offset !== undefined &&
    (!Number.isInteger(data.offset) ||
      data.offset < 0 ||
      data.offset > 2147483647)
  )
    invalid("Página inválida.");
  return data;
}
export function registerCampaignImportRoutes(app, { authStack }) {
  app.post(
    "/api/campaign-imports/:action",
    ...authStack,
    requirePermission("campaigns.write"),
    requirePermission("products.read"),
    async (req, res, next) => {
      try {
        const data = validateImportRequest(req.params.action, req.body);
        const result = await userRpc(req, "campaign_import_action", {
          p_org: req.organizationId,
          p_store: req.storeId || null,
          p_action: req.params.action,
          p_data: data,
        });
        res.set("Cache-Control", "no-store").json({ ok: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );
}
