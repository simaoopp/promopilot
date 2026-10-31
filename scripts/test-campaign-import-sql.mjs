import { PGlite } from "../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const file = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const db = new PGlite(),
  org = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const alice = "10000000-0000-4000-8000-000000000002",
  bob = "10000000-0000-4000-8000-000000000004";
const store = "30000000-0000-4000-8000-000000000001",
  storeB = "30000000-0000-4000-8000-000000000003";
const id = "40000000-0000-4000-8000-000000000001";
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
async function as(user) {
  await db.exec("reset role");
  await query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
    [user],
  );
  await db.exec("set role authenticated");
}
async function admin(sql, args = []) {
  await db.exec("reset role");
  return query(sql, args);
}
const call = (action, data = {}, o = org, st = store) =>
  scalar("select public.campaign_import_action($1,$2,$3,$4)", [
    o,
    st,
    action,
    JSON.stringify(data),
  ]);
let checks = 0;
const check = async (name, fn) => {
  await fn();
  console.log(`PASS importer SQL ${++checks}: ${name}`);
};
const config = {
  headerStart: 0,
  headerCount: 1,
  dataStart: 1,
  locale: "auto",
  mapping: { code: 0, promo: 1, previous: 2 },
  priceConfirmed: true,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  sheet: "Tabela 1",
  fileType: "csv",
  headers: ["SKU", "Promo", "Antes"],
};
const source = { name: "synthetic.csv", hash: "a".repeat(64) };
try {
  await db.exec(await file("supabase/tests/phase_zero.fixture.sql"));
  await db.exec(
    await file("supabase/migrations/20261015_platform_permissions.sql"),
  );
  await db.exec(
    "alter table articles add column updated_at timestamptz default now(),add column pvp2 numeric default 349.99,add column codigo_barras text default ''; create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new;end$$;",
  );
  await db.exec(
    await file(
      "supabase/migrations/20261019010000_articles_identity_expand.sql",
    ),
  );
  await db.exec(
    await file("supabase/diagnostics/articles_identity_backfill.sql"),
  );
  await db.exec(
    (
      await file("supabase/manual/20261019011000_articles_identity_indexes.sql")
    ).replaceAll("CONCURRENTLY ", ""),
  );
  await db.exec(
    await file("supabase/manual/20261019012000_articles_identity_cutover.sql"),
  );
  await check("additive migration applies twice", async () => {
    const migration = await file(
      "supabase/migrations/20261030090000_campaign_import.sql",
    );
    await db.exec(migration);
    await db.exec(migration);
  });
  await admin(
    "insert into articles(organization_id,artigo,descricao,pvp2,codigo_barras) values($1,$2,$3,999,$4)",
    [other, "article-expert", "Same code, other org", "999"],
  );
  await admin(
    "update articles set codigo_barras='12345' where organization_id=$1",
    [org],
  );
  const catalogBefore = (
    await admin("select * from articles order by article_id")
  ).rows;
  await as(alice);
  await check(
    "100 persistent templates + pagination + optimistic edits",
    async () => {
      for (let i = 0; i < 101; i++)
        await call("template_save", {
          supplier: "Synthetic",
          name: `Model ${i}`,
          config,
        });
      const list = await call("templates");
      assert.equal(list.items.length, 100);
      assert.equal((await call("templates", { offset: 100 })).items.length, 1);
      const t = list.items[0];
      await call("template_save", { ...t, name: "Edited", version: 1 });
      await assert.rejects(
        () => call("template_save", { ...t, name: "Stale", version: 1 }),
        (e) => e.code === "40001",
      );
    },
  );
  let session;
  await check(
    "start/retry idempotence and changed retry rejection",
    async () => {
      session = await call("start", { id, source, config, totalRows: 6 });
      assert.deepEqual(
        await call("start", { id, source, config, totalRows: 6 }),
        session,
      );
      await assert.rejects(
        () => call("start", { id, source, config, totalRows: 5 }),
        (e) => e.code === "40001",
      );
    },
  );
  const rows = [
    { raw: ["article-expert", "299,99", "350,00"] },
    { raw: ["unknown", "10"] },
    { raw: ["article-expert", "299,99"] },
    { raw: ["article-beta", "10"] },
    { raw: ["", ""] },
    { raw: ["article-expert", "400"] },
  ];
  await check(
    "out-of-order blocked; atomic failure leaves no rows",
    async () => {
      await assert.rejects(
        () => call("batch", { id, offset: 1, rows: [rows[0]] }),
        (e) => e.code === "40001",
      );
      await assert.rejects(
        () =>
          call("batch", {
            id,
            offset: 0,
            rows: [rows[0], { raw: ["x".repeat(1001)] }],
          }),
        (e) => e.code === "22023",
      );
      assert.equal((await call("read", { id })).rows.length, 0);
    },
  );
  await check(
    "exact organization+code, captured price, statuses, unchanged catalogue",
    async () => {
      session = await call("batch", { id, offset: 0, rows });
      const review = await call("read", { id });
      assert.deepEqual(
        review.rows.map((r) => r.state),
        ["valid", "missing", "duplicate", "missing", "ignored", "no_discount"],
      );
      assert.equal(review.rows[0].before_cents, 34999);
      assert.equal(review.rows[0].saving_cents, 5000);
      assert.equal(review.rows[0].discount_bps, 1429);
      assert.equal(review.rows[0].previous_mismatch, true);
      assert.deepEqual(await call("batch", { id, offset: 0, rows }), session);
      await assert.rejects(
        () => call("batch", { id, offset: 0, rows: [rows[0]] }),
        (e) => e.code === "40001",
      );
      assert.deepEqual(
        (await admin("select * from articles order by article_id")).rows,
        catalogBefore,
      );
      await as(alice);
    },
  );
  await check(
    "RLS, direct RPC and template ownership reject other tenant",
    async () => {
      await as(bob);
      assert.equal(
        (await call("templates", {}, other, storeB)).items.length,
        0,
      );
      assert.equal(
        Number(await scalar("select count(*) from campaign_import_rows")),
        0,
      );
      await assert.rejects(
        () => call("read", { id }, other, storeB),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        () => call("read", { id }),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        () => query("select ci_match($1,$2,$3)", [org, "article-expert", ""]),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        () => query("update campaign_import_rows set before_cents=1"),
        (e) => e.code === "42501",
      );
      await as(alice);
    },
  );
  await check(
    "price snapshot survives catalog changes and promo editing",
    async () => {
      await admin("update articles set pvp2=500 where organization_id=$1", [
        org,
      ]);
      await as(alice);
      session = await call("edit", {
        id,
        version: session.version,
        rowIndex: 0,
        promoInput: "249,99",
      });
      const row = (await call("read", { id })).rows[0];
      assert.equal(row.before_cents, 34999);
      assert.equal(row.promo_cents, 24999);
      await assert.rejects(
        () => call("edit", { id, version: 1, rowIndex: 0, promoInput: "1" }),
        (e) => e.code === "40001",
      );
    },
  );
  await check(
    "price corrections retain prior values in private audit",
    async () => {
      await db.exec("reset role");
      const audit = (
        await query(
          "select before,metadata from audit_logs where action='campaign-import.edit' and entity_id=$1 order by created_at desc limit 1",
          [id],
        )
      ).rows[0];
      assert.equal(audit.before.promoCents, 29999);
      assert.equal(audit.metadata.promoCents, 24999);
      assert.equal(audit.metadata.beforeCents, 34999);
      await as(alice);
    },
  );
  await check(
    "finalize refuses unresolved rows, explicit exclusion; finalization replay freezes snapshot",
    async () => {
      await assert.rejects(
        () => call("finalize", { id, version: session.version }),
        (e) => e.code === "22023",
      );
      session = await call("exclude_invalid", { id, version: session.version });
      session = await call("finalize", { id, version: session.version });
      assert.equal(session.state, "completed");
      assert.deepEqual(await call("finalize", { id, version: 1 }), session);
      await assert.rejects(
        () =>
          call("edit", {
            id,
            version: session.version,
            rowIndex: 0,
            promoInput: "1",
          }),
        (e) => e.code === "40001",
      );
    },
  );
  await check(
    "barcode fallback only when unique, exact code wins, same code has independent tenant price",
    async () => {
      await admin(
        "insert into articles(organization_id,artigo,descricao,pvp2,codigo_barras) values($1,'A-1','First',80,'shared'),($1,'A-2','Second',80,'shared'),($1,'A-3','Third',80,'unique')",
        [org],
      );
      await as(alice);
      const sid = "40000000-0000-4000-8000-000000000002";
      await call("start", {
        id: sid,
        source,
        config: {
          ...config,
          mapping: { code: 0, promo: 1, barcode: 2, information: 3 },
        },
        totalRows: 5,
      });
      await call("batch", {
        id: sid,
        offset: 0,
        rows: [
          { raw: ["missing", "50", "shared"] },
          { raw: ["missing", "50", "unique"] },
          { raw: ["A-1", "50", "unique"] },
          { raw: ["A-2", "50", "", "Atualização de PVP"] },
          { raw: ["A-3", "50"], flags: ["Formula must be reviewed"] },
        ],
      });
      const review = await call("read", { id: sid });
      assert.deepEqual(
        review.rows.map((r) => r.state),
        ["ambiguous", "valid", "valid", "blocked", "review"],
      );
      assert.equal(review.rows[1].code, "A-3");
      assert.equal(review.rows[2].code, "A-1");
      await as(bob);
      const bid = "40000000-0000-4000-8000-000000000003";
      await call(
        "start",
        { id: bid, source, config, totalRows: 1 },
        other,
        storeB,
      );
      await call(
        "batch",
        { id: bid, offset: 0, rows: [{ raw: ["article-expert", "299.99"] }] },
        other,
        storeB,
      );
      assert.equal(
        (await call("read", { id: bid }, other, storeB)).rows[0].before_cents,
        99900,
      );
      await as(alice);
    },
  );
  await check(
    "SQL monetary parser matches shared engine and malformed config cannot bypass RPC",
    async () => {
      const { moneyCents } = await import(
        "../src/shared/campaign-import/model.js"
      );
      await db.exec("reset role");
      for (const locale of ["auto", "pt", "en"])
        for (const value of [
          "349,99",
          "349.99",
          "1.234",
          "1,234",
          "1.234,56",
          "1,234.56",
          "EUR 20",
          "20 €",
          "-1",
          "0",
          "1e3",
          "",
          "12abc",
          "1,2,3",
        ])
          assert.equal(
            await scalar("select ci_money($1,$2)", [value, locale]),
            moneyCents(value, locale),
            `${locale}:${value}`,
          );
      await as(alice);
      await assert.rejects(
        () =>
          call("start", {
            id: "40000000-0000-4000-8000-000000000004",
            source,
            config: { ...config, priceConfirmed: false },
            totalRows: 1,
          }),
        (e) => e.code === "22023",
      );
    },
  );
  await check(
    "another store, CEO without membership and forged template ID are blocked",
    async () => {
      const template = (await call("templates")).items[0];
      await as(bob);
      await assert.rejects(
        () =>
          call(
            "template_save",
            { ...template, version: template.version, config },
            other,
            storeB,
          ),
        (e) => e.code === "42501",
      );
      await as(alice);
      await assert.rejects(
        () => call("read", { id }, org, "30000000-0000-4000-8000-000000000002"),
        (e) => e.code === "42501",
      );
      await as("10000000-0000-4000-8000-000000000001");
      await assert.rejects(
        () => call("read", { id }),
        (e) => e.code === "42501",
      );
      await as(alice);
    },
  );
  await check(
    "permission revocation is effective on existing sessions",
    async () => {
      await admin(
        "insert into user_permissions(organization_id,user_id,permission_key,allowed) values($1,$2,'campaigns.write',false)",
        [org, alice],
      );
      await as(alice);
      await assert.rejects(
        () => call("read", { id }),
        (e) => e.code === "42501",
      );
      assert.equal(
        Number(await scalar("select count(*) from campaign_import_sessions")),
        0,
      );
    },
  );
  console.log(
    `${checks} SQL scenarios on PGlite; independent multi-connection PostgreSQL not exercised.`,
  );
} finally {
  await db.close();
}
