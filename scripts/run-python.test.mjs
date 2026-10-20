import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonCandidates, parsePythonVersion, findPython } from './run-python.mjs';

test('Windows uses py -3 and falls back to python; Linux uses python3 first', () => {
  assert.deepEqual(pythonCandidates({ platform: 'win32', override: '' }), [['py', '-3'], ['python'], ['python3']]);
  assert.deepEqual(pythonCandidates({ platform: 'linux', override: '' }), [['python3'], ['python']]);
});
test('explicit executable override is honoured without shell interpretation', () => {
  assert.deepEqual(pythonCandidates({ platform: 'win32', override: 'C:\\Python313\\python.exe' }), [['C:\\Python313\\python.exe']]);
});
test('minimum version 3.9 enforced and failures skip to next candidate', () => {
  const called = [];
  const mockSpawn = (exe, args) => {
    called.push([exe, ...args]);
    return exe === 'old' ? { status: 0, stdout: 'Python 3.8.10' } : { status: 0, stdout: 'Python 3.13.2' };
  };
  assert.deepEqual(findPython({ candidates: [['old'], ['new', '-3']], spawn: mockSpawn }), ['new', '-3']);
  assert.deepEqual(called, [['old', '--version'], ['new', '-3', '--version']]);
  assert.equal(parsePythonVersion('Python 3.13.5').minor, 13);
  assert.equal(findPython({ candidates: [['missing']], spawn: () => ({ error: Error('ENOENT'), status: null }) }), null);
});
