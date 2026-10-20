#!/usr/bin/env node
// Portable Python 3 launcher: works with Windows py.exe, python and python3.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function pythonCandidates({ platform = process.platform, override = process.env.PROMOPILOT_PYTHON } = {}) {
  if (override?.trim()) return [[override.trim()]];
  return platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
}

export function parsePythonVersion(output = '') {
  const match = String(output).match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

export function findPython({ candidates = pythonCandidates(), spawn = spawnSync } = {}) {
  for (const candidate of candidates) {
    const probe = spawn(candidate[0], [...candidate.slice(1), '--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const version = parsePythonVersion(`${probe.stdout || ''} ${probe.stderr || ''}`);
    if (probe.status === 0 && version && (version.major > 3 || (version.major === 3 && version.minor >= 9))) return candidate;
  }
  return null;
}

export function main(args = process.argv.slice(2)) {
  if (!args.length) {
    console.error('Uso: node scripts/run-python.mjs <script.py> [argumentos]');
    return 2;
  }
  const command = findPython();
  if (!command) {
    console.error('Python 3.9+ não encontrado. Instala Python 3 e confirma `py -3 --version` (Windows) ou `python3 --version` (Linux). Podes definir PROMOPILOT_PYTHON com o caminho do executável.');
    return 127;
  }
  const result = spawnSync(command[0], [...command.slice(1), ...args], { stdio: 'inherit', windowsHide: true });
  if (result.error) {
    console.error(`Falha ao executar Python: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Python interrompido por ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
