import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "../../server/node_modules/playwright/index.mjs";
import { PGlite } from "../../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js";
const require = createRequire(import.meta.url),
  webpack = require("webpack"),
  express = require("../../server/node_modules/express");
const root = fileURLToPath(new URL("../../", import.meta.url)),
  output = await mkdtemp(path.join(tmpdir(), "promopilot-import-ui-"));
const screenshots = process.env.IMPORT_QA_SCREENSHOTS || output;
await mkdir(screenshots, { recursive: true });
process.env.NODE_ENV = "production";
await new Promise((resolve, reject) =>
  webpack(
    {
      mode: "production",
      context: root,
      entry: "./tests/campaign-import/browser-harness.jsx",
      output: { path: output, filename: "main.js", publicPath: "/" },
      module: {
        rules: [
          {
            test: /\.[jm]sx?$/,
            exclude: /node_modules/,
            use: {
              loader: require.resolve("babel-loader"),
              options: { presets: [require.resolve("babel-preset-react-app")] },
            },
          },
          {
            test: /\.css$/,
            use: [
              require.resolve("style-loader"),
              require.resolve("css-loader"),
            ],
          },
        ],
      },
      plugins: [
        new webpack.NormalModuleReplacementPlugin(
          /^\.\/importApi$/,
          (resource) => {
            resource.request = path.join(
              root,
              "tests/campaign-import/browser-api-fixture.js",
            );
          },
        ),
      ],
      resolve: { extensions: [".js", ".jsx", ".mjs"] },
      performance: { hints: false },
    },
    (error, stats) =>
      error || stats.hasErrors()
        ? reject(
            error || new Error(stats.toString({ all: false, errors: true })),
          )
        : resolve(),
  ),
);
await writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Importer QA</title><div id="root"></div><script src="/main.js"></script></html>',
);
const db = new PGlite();
let browser, server;
const file = (p) => readFile(path.join(root, p), "utf8");
try {
  await db.exec(await file("supabase/tests/phase_zero.fixture.sql"));
  await db.exec(
    await file("supabase/migrations/20261015_platform_permissions.sql"),
  );
  await db.exec(
    "alter table articles add column updated_at timestamptz default now(),add column pvp2 numeric default 349.99,add column codigo_barras text default '';create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;",
  );
  for (const name of [
    "supabase/migrations/20261019010000_articles_identity_expand.sql",
    "supabase/diagnostics/articles_identity_backfill.sql",
    "supabase/manual/20261019011000_articles_identity_indexes.sql",
    "supabase/manual/20261019012000_articles_identity_cutover.sql",
    "supabase/migrations/20261030090000_campaign_import.sql",
  ])
    await db.exec((await file(name)).replaceAll("CONCURRENTLY ", ""));
  const org = "20000000-0000-4000-8000-000000000001",
    store = "30000000-0000-4000-8000-000000000001";
  for (let i = 1; i <= 7; i++)
    await db.query(
      "insert into articles(organization_id,artigo,descricao,pvp2) values($1,$2,$3,349.99)",
      [org, `00${124 + i}`, `Produto sintético ${i}`],
    );
  await db.exec(
    "select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;",
  );
  const app = express();
  app.use(express.json());
  app.post("/fixture-api", async (req, res) => {
    try {
      res.json(
        (
          await db.query("select campaign_import_action($1,$2,$3,$4) data", [
            org,
            store,
            req.body.action,
            JSON.stringify(req.body.data),
          ])
        ).rows[0].data,
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.use(express.static(output));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.IMPORT_QA_CHROMIUM
      ? { executablePath: process.env.IMPORT_QA_CHROMIUM }
      : {}),
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      ...(process.env.IMPORT_QA_EXTRA_ARGS || "").split("|").filter(Boolean),
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 980 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.getByRole("button", { name: /Importar tabela comercial/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({
    path: path.join(screenshots, "01-import-source.png"),
  });
  await page
    .getByRole("textbox", { name: "Ou cole a tabela" })
    .fill(
      "SKU\tDescrição\tPromo\tPVP1\tPVP3\n" +
        Array.from(
          { length: 7 },
          (_, i) =>
            `00${125 + i}\tProduto sintético ${i + 1}\t299,99\t400,00\t499,99`,
        ).join("\n"),
    );
  await page.getByRole("button", { name: "Interpretar tabela colada" }).click();
  await page
    .getByRole("button", { name: "Associar campos", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Confirmo que PVP2/ }).check();
  await page.screenshot({
    path: path.join(screenshots, "02-import-mapping.png"),
  });
  await page.getByRole("button", { name: "Obter preços do catálogo" }).click();
  await page.getByRole("button", { name: "Validar e continuar" }).waitFor();
  assert.equal(await page.locator(".ci-status-valid").count(), 7);
  await page.screenshot({
    path: path.join(screenshots, "03-import-review.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(screenshots, "04-import-mobile.png"),
  });
  assert.ok(
    await page
      .locator(".ci-dialog")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  );
  await page.getByRole("button", { name: "Validar e continuar" }).click();
  await page.getByRole("button", { name: "Adicionar 7 artigos" }).click();
  const items = JSON.parse(await page.getByTestId("campaign").innerText());
  assert.equal(items.length, 7);
  assert.equal(items[0].antes, 349.99);
  assert.equal(items[0].atual, 299.99);
  assert.equal(items[0].importacao.organizationId, org);
  // Re-open saved review and confirm the existing campaign cannot receive duplicates.
  await page.getByRole("button", { name: /Importar tabela comercial/ }).click();
  await page.getByText("Retomar uma importação recente").click();
  await page
    .getByRole("button", { name: "Retomar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Validar e continuar" }).click();
  await page.getByText("0 artigos prontos").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Adicionar 0 artigos" })
      .isDisabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Chromium: real Web Worker extraction, 7 synthetic rows, SQL snapshots, five steps, mobile overflow, resume and dedupe.",
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.close();
}
