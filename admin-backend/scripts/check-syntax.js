const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build']);

function collectJavaScriptFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...collectJavaScriptFiles(path.join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

let failed = false;
for (const file of collectJavaScriptFiles(root)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });

  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Admin backend JavaScript syntax check passed.');
}
