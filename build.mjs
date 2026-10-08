#!/usr/bin/env node
/* Builds Chrome and Firefox packages from the single source in extension/.
   The source stays Chrome-shaped so it can still be loaded unpacked directly;
   the Firefox variant is produced by patching the manifest at build time. */

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'extension');
const OUT = join(ROOT, 'build');

// Firefox needs a stable extension ID. Without one, storage.sync throws at
// runtime and AMO refuses the upload - it is not optional the way it is in
// Chrome. gecko_android is what marks the add-on installable on Android.
const GECKO_ID = 'twitter-defang@extensions.local';
// 142 is the floor for data_collection_permissions on Firefox for Android
// (140 on desktop); the linter rejects anything older once that key is set.
const MIN_FIREFOX = '142.0';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function build(target, patch) {
  const dir = join(OUT, target);
  cpSync(SRC, dir, { recursive: true });

  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  patch(manifest);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const zip = join(OUT, `twitter-defang-${target}.zip`);
  execFileSync('zip', ['-qr', zip, '.'], { cwd: dir });
  console.log(`  ${target.padEnd(8)} -> build/${target}/  +  build/twitter-defang-${target}.zip`);
}

console.log('Twitter Defang build');
build('chrome', () => {});
build('firefox', (m) => {
  m.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      // AMO requires this to be explicit. The extension has no server, no
      // analytics and no network calls of its own: settings live in
      // storage.sync and nothing else leaves the browser.
      data_collection_permissions: { required: ['none'] }
    },
    gecko_android: { strict_min_version: MIN_FIREFOX }
  };
});
console.log('done');
