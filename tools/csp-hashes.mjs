// Keeps the Content-Security-Policy in vercel.json in step with the inline scripts in every page under site/.
//
// The CSP allows only inline scripts whose exact SHA-256 hash is listed, so editing any inline script
// (including the CONFIG block) changes its hash and the browser would refuse to run it.
//
//   node tools/csp-hashes.mjs           print the hashes the pages need
//   node tools/csp-hashes.mjs --check   fail (exit 1) if vercel.json does not list exactly those hashes
//   node tools/csp-hashes.mjs --write   rewrite the hashes in vercel.json
//
// tools/validate.mjs (the Vercel build command) runs the same check, so a deploy with stale hashes stops
// instead of going live broken.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const htmlPath = `${root}site/index.html`;
export const vercelPath = `${root}vercel.json`;

// All HTML pages joined: one CSP header covers every path, so it must list the inline scripts of every page
export const siteHtml = () => {
  const out = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".html")) out.push(readFileSync(p, "utf8")); } };
  walk(`${root}site`);
  return out.join("\n");
};

const executable = (attrs) => {
  if (/\ssrc\s*=/i.test(attrs)) return false;
  const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
  return !type || type === "module" || /^(text|application)\/(x-)?(java|ecma)script$/.test(type);
};

// Hashes of every inline script the browser would execute
export const inlineScriptHashes = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs]) => executable(attrs))
  .map(([, , body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

// The CSP header object for every path ("/(.*)") in vercel.json; throws if it is missing
export const cspHeader = (config) => {
  const rule = (config.headers || []).find((r) => r.source === "/(.*)");
  const header = rule?.headers?.find((h) => h.key.toLowerCase() === "content-security-policy");
  if (!header) throw new Error('vercel.json has no Content-Security-Policy header for source "/(.*)"');
  return header;
};

export const compare = (html, config) => {
  const needed = inlineScriptHashes(html);
  const listed = [...cspHeader(config).value.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
  const same = needed.length > 0 && listed.length === needed.length && needed.every((h) => listed.includes(h));
  return { needed, listed, same };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = siteHtml();
  const mode = process.argv[2];
  if (!mode) { console.log(inlineScriptHashes(html).join("\n")); process.exit(0); }
  const config = JSON.parse(readFileSync(vercelPath, "utf8"));
  const { needed, same } = compare(html, config);

  if (mode === "--check") {
    if (same) { console.log(`CSP OK: ${needed.length} inline script hashes match the pages in site/`); process.exit(0); }
    console.error("CSP hashes in vercel.json do not match the inline scripts in site/.");
    console.error("Run: node tools/csp-hashes.mjs --write   then review and commit vercel.json.");
    process.exit(1);
  }
  if (mode === "--write") {
    const header = cspHeader(config);
    header.value = header.value.replace(/(script-src 'self')(?: 'sha256-[A-Za-z0-9+/=]+')*/, `$1 ${needed.join(" ")}`);
    writeFileSync(vercelPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(same ? "vercel.json already up to date" : `vercel.json updated with ${needed.length} hashes`);
    process.exit(0);
  }
  console.error(`Unknown option ${mode}`); process.exit(2);
}
