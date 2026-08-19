import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.wrangler',
  '.vite',
  'coverage'
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'privacy-scan.mjs'
]);

// Violation patterns
const VIOLATIONS = [
  {
    name: 'Hardcoded Real Email Address',
    regex: /\b[a-zA-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  },
  {
    name: 'Prohibited Historical Identifier / PII',
    regex: /\b(berry_punch|dace909|fort90filmclub|laniii420|luckybjerkin|ramblingenzyme|sickovision|thegluefactory|kinorelax|dsp\.coffee|videohell\.cloud)\b/gi,
  },
  {
    name: 'Hardcoded Secret / Magic Password Pattern',
    regex: /\b(GHOST-17|MAGIC_PASSWORDS)\b/g,
  },
  {
    name: 'Live Cloudflare D1 UUID in Config',
    fileFilter: (rel) => rel === 'wrangler.jsonc' || rel === 'pages/wrangler.jsonc',
    regex: /"database_id":\s*"(?!(?:00000000-0000-0000-0000-000000000000|\$|\s*"))[0-9a-fA-F-]{36}"/g,
  }
];

let totalViolations = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        scanDir(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      if (!IGNORED_FILES.has(entry.name)) {
        scanFile(path.join(dir, entry.name));
      }
    }
  }
}

function scanFile(filePath) {
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  if (/\.(png|jpg|jpeg|gif|webp|ico|wasm|pdf|zip)$/i.test(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rule of VIOLATIONS) {
    if (rule.fileFilter && !rule.fileFilter(relPath)) continue;

    lines.forEach((line, idx) => {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(line)) !== null) {
        console.error(`[PRIVACY ERROR] ${rule.name}: found "${match[0]}" in ${relPath}:${idx + 1}`);
        totalViolations++;
      }
    });
  }
}

console.log('🔒 Running automated Privacy & PII Boundary scan...');
scanDir(process.cwd());

if (totalViolations > 0) {
  console.error(`\n❌ Privacy scan FAILED: ${totalViolations} violation(s) detected.`);
  console.error('All personal user info, third-party accounts, and live resource IDs must follow 12-Factor config and RFC 2606 placeholders.\n');
  process.exit(1);
} else {
  console.log('✅ Privacy scan PASSED: 0 privacy violations detected. 12-Factor standard satisfied.');
}
