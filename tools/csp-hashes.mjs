// Keeps the Content-Security-Policy in site/_headers in step with the inline scripts in site/index.html.
//
// The CSP allows only inline scripts whose exact SHA-256 hash is listed, so editing any inline script
// (including the CONFIG block) changes its hash and the browser would refuse to run it.
//
//   node tools/csp-hashes.mjs           print the hashes the page needs
//   node tools/csp-hashes.mjs --check   fail (exit 1) if site/_headers does not list exactly those hashes
//   node tools/csp-hashes.mjs --write   rewrite the hashes in site/_headers
//
// Netlify runs --check as the build command, so a deploy with stale hashes stops instead of going live broken.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const htmlPath = `${root}site/index.html`;
const headersPath = `${root}site/_headers`;

const html = readFileSync(htmlPath, "utf8");
const executable = (attrs) => {
  if (/\ssrc\s*=/i.test(attrs)) return false;
  const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
  return !type || type === "module" || /^(text|application)\/(x-)?(java|ecma)script$/.test(type);
};
const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs]) => executable(attrs))
  .map(([, , body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

const mode = process.argv[2];
if (!mode) { console.log(hashes.join("\n")); process.exit(0); }

const headers = readFileSync(headersPath, "utf8");
const listed = [...headers.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
const same = listed.length === hashes.length && hashes.every((h) => listed.includes(h));

if (mode === "--check") {
  if (same) { console.log(`CSP OK: ${hashes.length} inline script hashes match site/index.html`); process.exit(0); }
  console.error("CSP hashes in site/_headers do not match the inline scripts in site/index.html.");
  console.error("Run: node tools/csp-hashes.mjs --write   then review and commit site/_headers.");
  process.exit(1);
}
if (mode === "--write") {
  const updated = headers.replace(/(script-src 'self')(?: 'sha256-[A-Za-z0-9+/=]+')*/, `$1 ${hashes.join(" ")}`);
  writeFileSync(headersPath, updated);
  console.log(same ? "site/_headers already up to date" : `site/_headers updated with ${hashes.length} hashes`);
  process.exit(0);
}
console.error(`Unknown option ${mode}`); process.exit(2);
