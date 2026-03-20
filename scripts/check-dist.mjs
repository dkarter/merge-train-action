#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const isCi = process.env.CI === 'true';
const requiredDistFiles = [
  'dist/index.js',
  'dist/index.js.map',
  'dist/licenses.txt',
  'dist/sourcemap-register.js'
];
const nonDistPathspec = ['--', '.', ':(exclude)dist/**'];

const fail = (message, details) => {
  console.error(message);
  if (details) {
    console.error(details);
  }
  process.exit(1);
};

for (const filePath of requiredDistFiles) {
  let stats;

  try {
    stats = statSync(filePath);
  } catch {
    fail(`dist:check failed: missing required artifact ${filePath}`);
  }

  if (!stats.isFile()) {
    fail(`dist:check failed: expected file artifact at ${filePath}`);
  }

  if (stats.size === 0) {
    fail(`dist:check failed: artifact is empty ${filePath}`);
  }
}

let dirtyNonDistFiles = '';

try {
  dirtyNonDistFiles = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no', ...nonDistPathspec],
    {
      encoding: 'utf8'
    }
  ).trim();
} catch {
  fail('dist:check failed: unable to inspect git working tree');
}

if (dirtyNonDistFiles.length > 0) {
  if (isCi) {
    fail(
      'dist:check failed: packaging modified tracked files outside dist/',
      dirtyNonDistFiles
    );
  }

  console.warn(
    'dist:check warning: non-dist tracked changes already exist; skipping package side-effect enforcement outside CI'
  );

  console.log('dist:check passed with warning: required artifacts exist');
  process.exit(0);
}

console.log(
  'dist:check passed: required artifacts exist and non-dist files are unchanged'
);
