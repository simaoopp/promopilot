#!/usr/bin/env python3
from __future__ import annotations
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
errors: list[str] = []
def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)
def scan_forbidden_patterns() -> None:
    forbidden = {
        "alert(": "Ainda existem alert() no frontend.",
        "window.print(": "Ainda existem chamadas diretas a window.print fora do helper.",
        'import "../data/artigos.json"': "Ainda existe import direto do JSON de artigos.",
        'from "../data/artigos.json"': "Ainda existe import direto do JSON de artigos.",
    }
    for file_path in [*SRC.rglob("*.js"), *SRC.rglob("*.jsx")]:
        content = file_path.read_text(encoding="utf-8")
        if file_path.name == "print.js":
            content = content.replace("window.print()", "")
        for pattern, message in forbidden.items():
            if pattern in content:
                errors.append(f"{message} ({file_path.relative_to(ROOT)})")
def check_required_files() -> None:
    assert_condition((ROOT / "public" / "manifest.json").exists(), "public/manifest.json em falta.")
    assert_condition((ROOT / "supabase" / "migrations").exists(), "Pasta supabase/migrations em falta.")
    assert_condition((ROOT / "scripts" / "import-artigos-to-supabase.mjs").exists(), "Script de importação dos artigos em falta.")
def check_env_example() -> None:
    env_text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for key in ["REACT_APP_SUPABASE_URL=","REACT_APP_SUPABASE_PUBLISHABLE_KEY=","REACT_APP_API_BASE_URL=","SUPABASE_URL=","SUPABASE_SERVICE_ROLE_KEY=","ARTICLES_TABLE="]:
        assert_condition(key in env_text, f".env.example sem a chave {key}")
def check_server_syntax() -> None:
    for relative_path in ["server/index.js","server/lib/supabaseClients.js","server/services/articleRepository.js"]:
        result = subprocess.run(["node", "--check", str(ROOT / relative_path)], capture_output=True, text=True)
        assert_condition(result.returncode == 0, f"Erro de sintaxe em {relative_path}: {result.stderr.strip()}")
def main() -> int:
    scan_forbidden_patterns(); check_required_files(); check_env_example(); check_server_syntax()
    if errors:
        print("QA falhou:")
        for item in errors: print(f" - {item}")
        return 1
    print("QA estático concluído sem falhas críticas.")
    return 0
if __name__ == "__main__": raise SystemExit(main())
