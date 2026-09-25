import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), 'x402-packed-test-'));

try {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--workspaces', '--json', '--pack-destination', temp,
  ], { cwd: root, encoding: 'utf8' }));
  assert.equal(packed.length, 3);
  for (const artifact of packed) {
    for (const required of ['dist/index.js', 'dist/index.d.ts']) {
      assert.ok(artifact.files.some((file) => file.path === required),
        `${artifact.name} tarball is missing ${required}`);
    }
  }
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    ...packed.map((artifact) => join(temp, artifact.filename)),
  ], { cwd: temp, stdio: 'inherit' });
  for (const artifact of packed) {
    const installed = JSON.parse(readFileSync(
      join(temp, 'node_modules', artifact.name, 'package.json'), 'utf8'));
    assert.equal(installed.version, artifact.version);
  }
  copyFileSync(join(root, 'tests/packed-runtime.test.mjs'), join(temp, 'packed-runtime.test.mjs'));
  execFileSync(process.execPath, ['--test', 'packed-runtime.test.mjs'], {
    cwd: temp, stdio: 'inherit',
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
