#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []

def ok(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

def contains(path: str, patterns: list[str]) -> None:
    p = ROOT / path
    ok(p.exists(), f"{path} em falta.")
    if not p.exists():
        return
    text = p.read_text(encoding="utf-8")
    for pattern in patterns:
        ok(pattern in text, f"{path} não contém: {pattern}")

def main() -> int:
    required_files = [
        "supabase/migrations/20260522_saas_enterprise_core.sql",
        "supabase/tests/rls_multitenant_permissions.template.sql",
        "supabase/tests/rls_multitenant_permissions.executable.sql",
        "supabase/migrations/20260523_saas_tenant_backfill_activation.sql",
        "supabase/staging/03_enforce_tenant_constraints_after_backfill.sql",
        "supabase/staging/README.md",
        "render/staging-env.example",
        "cloudrun/worker-env.staging.example",
        "cloudbuild.staging.yaml",
        "docs/SAAS_FULL_CHECKLIST_STATUS.md",
        "docs/STAGING_AND_PERMISSION_TESTS.md",
        "docs/OUTSIDE_PROJECT_ACTIONS.md",
        "docs/SAAS_EXECUTIVE_GAP_REPORT.md",
        "docs/SAAS_STAGING_BACKFILL_RUNBOOK.md",
        "docs/SECURITY.md",
        "docs/RUNBOOK.md",
        "docs/BILLING_PLAN.md",
        "server/middleware/tenant.js",
        "server/middleware/errorHandler.js",
        "server/middleware/requestContext.js",
        "server/services/saas/auditLogService.js",
        "server/services/saas/usageService.js",
        "server/routes/saasAdmin.js",
    ]
    for path in required_files:
        ok((ROOT / path).exists(), f"Ficheiro obrigatório em falta: {path}")

    contains("supabase/migrations/20260522_saas_enterprise_core.sql", [
        "create table if not exists public.organizations",
        "create table if not exists public.organization_members",
        "create table if not exists public.audit_logs",
        "create table if not exists public.app_jobs",
        "create table if not exists public.usage_events",
        "create or replace function public.is_org_member",
        "create or replace function public.has_org_role",
        "storage_object_org_id",
    ])

    contains("supabase/migrations/20260523_saas_tenant_backfill_activation.sql", [
        "Backfill existing business data",
        "search_articles_for_labels",
        "p_organization_id",
        "resolve_article_rpc_organization",
        "articles_org_admin_all",
    ])
    contains("supabase/tests/rls_multitenant_permissions.executable.sql", [
        "RLS FAIL",
        "tenant-a@example.test",
        "tenant-b@example.test",
        "automatic-campaign-pdfs bucket is public",
    ])
    contains("server/app.js", ["requestContext", "attachTenantContext", "registerSaasAdminRoutes", "errorHandler"])
    contains("server/package.json", ["qa:saas", "qa:all"])

    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    ok(pkg.get("name") != "react", "package.json raiz ainda tem nome genérico react.")
    server_pkg = json.loads((ROOT / "server/package.json").read_text(encoding="utf-8"))
    ok(server_pkg.get("name") != "fabricante-scraper", "server/package.json ainda tem nome genérico fabricante-scraper.")

    if errors:
        print("SAAS READINESS CHECK falhou:")
        for item in errors:
            print(f" - {item}")
        return 1

    print("SAAS READINESS CHECK: OK.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
