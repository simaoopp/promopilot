import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
let allowed = true,
  calls = [];
await mock.module("../lib/supabaseClients.js", {
  namedExports: {
    supabaseAdminClient: null,
    createSupabaseUserClient: (token) => ({
      async rpc(name, args) {
        calls.push({ name, args, token });
        return {
          data: name === "platform_permission" ? allowed : { saved: true },
        };
      },
    }),
  },
});
const { registerCampaignImportRoutes, validateImportRequest } = await import(
  "../routes/campaignImports.js"
);
const { AppError, errorHandler } = await import(
  "../middleware/errorHandler.js"
);
const org = "20000000-0000-4000-8000-000000000001",
  store = "30000000-0000-4000-8000-000000000001";
const id = "40000000-0000-4000-8000-000000000001";
const app = express();
app.use(express.json({ limit: "2mb" }));
registerCampaignImportRoutes(app, {
  authStack: [
    (req, res, next) => {
      if (req.headers.authorization !== "Bearer fixture")
        return next(new AppError("AUTH_REQUIRED", "Sign in"));
      req.organizationId = org;
      req.storeId = store;
      req.accessToken = "fixture";
      next();
    },
  ],
});
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const request = (action, data = {}, auth = true) =>
  fetch(
    `http://127.0.0.1:${server.address().port}/api/campaign-imports/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer fixture" } : {}),
      },
      body: JSON.stringify(data),
    },
  );
test("importer HTTP authorization, bounded payloads and context", async (t) => {
  try {
    await t.test("no auth fails before RPC", async () => {
      calls = [];
      assert.equal((await request("sessions", {}, false)).status, 401);
      assert.equal(calls.length, 0);
    });
    await t.test(
      "permission revoked, including catalog reads, blocks import",
      async () => {
        allowed = false;
        calls = [];
        assert.equal((await request("sessions")).status, 403);
        assert.ok(!calls.some((c) => c.name === "campaign_import_action"));
        allowed = true;
      },
    );
    await t.test(
      "request-scoped user JWT, canonical tenant, no-store",
      async () => {
        calls = [];
        const r = await request("sessions");
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("cache-control"), "no-store");
        const call = calls.find((c) => c.name === "campaign_import_action");
        assert.deepEqual(call.args, {
          p_org: org,
          p_store: store,
          p_action: "sessions",
          p_data: {},
        });
        assert.equal(call.token, "fixture");
      },
    );
    await t.test(
      "client cannot supply organization or catalog snapshot",
      async () => {
        for (const data of [
          { organizationId: org },
          { before_cents: 1 },
          { organization_id: org },
        ])
          assert.equal((await request("sessions", data)).status, 400);
      },
    );
    await t.test(
      "unknown action, malformed identity, batch size, cell length and flags rejected",
      async () => {
        assert.equal((await request("delete")).status, 400);
        assert.equal((await request("read", { id: "not-uuid" })).status, 400);
        for (const rows of [
          [],
          Array.from({ length: 201 }, () => ({ raw: ["x"] })),
          [{ raw: ["x".repeat(1001)] }],
          [{ raw: [{ html: "unsafe" }] }],
          [{ raw: ["x"], flags: [{}] }],
        ])
          assert.equal(
            (await request("batch", { id, offset: 0, rows })).status,
            400,
          );
        assert.equal(
          (
            await request("batch", {
              id,
              offset: 0,
              rows: [{ raw: ["00125", "299,99"], flags: [] }],
            })
          ).status,
          200,
        );
      },
    );
    await t.test("ambiguous price mapping needs explicit confirmation", () => {
      const config = {
        headerStart: 0,
        headerCount: 0,
        dataStart: 0,
        locale: "auto",
        mapping: { code: 0 },
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        priceConfirmed: false,
      };
      assert.throws(
        () =>
          validateImportRequest("start", {
            id,
            config,
            totalRows: 1,
            source: { hash: "a".repeat(64) },
          }),
        /Confirme/,
      );
      assert.throws(
        () =>
          validateImportRequest("start", {
            id,
            config: { ...config, priceConfirmed: true },
            totalRows: 1,
            source: { hash: "a".repeat(64) },
          }),
        /PVP2/,
      );
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    mock.restoreAll();
  }
});
