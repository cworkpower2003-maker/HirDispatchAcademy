// Pre-deploy checks for the static site. Vercel runs this as the build command, so any failure stops the deploy.
//   node tools/validate.mjs
// Checks: the homepage and referenced local files exist, every in-page #link and policy dialog target exists,
// vercel.json is valid and serves site/ with the expected security headers, the CSP hashes match the inline
// scripts, and no secret-looking strings were added to the published files.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, htmlPath, vercelPath } from "./csp-hashes.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
const failures = [];
const check = (ok, message) => { console.log(`${ok ? "PASS" : "FAIL"}  ${message}`); if (!ok) failures.push(message); };

// 1. Homepage
const hasHome = existsSync(htmlPath) && statSync(htmlPath).size > 0;
check(hasHome, "site/index.html exists and is not empty");
const html = hasHome ? readFileSync(htmlPath, "utf8") : "";

// 2. Local files referenced from the page (src/href that are not external, data:, mailto:, tel: or #fragments)
const localRefs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(?:[a-z]+:|#|\/\/|\$\{)/i.test(u));
const missingRefs = localRefs.filter((u) => !existsSync(join(site, u.split(/[?#]/)[0].replace(/^\//, ""))));
check(hasHome && missingRefs.length === 0, `local files referenced by the page exist (${localRefs.length} found)${missingRefs.length ? `: missing ${missingRefs.join(", ")}` : ""}`);
for (const f of ["robots.txt", "og-image.jpg"]) check(existsSync(join(site, f)), `site/${f} exists`);

// 3. In-page links and policy dialogs
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hashLinks = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
const brokenLinks = hashLinks.filter((id) => !ids.has(id));
check(hasHome && hashLinks.length > 0 && brokenLinks.length === 0, `in-page #links resolve (${hashLinks.length} targets)${brokenLinks.length ? `: broken ${brokenLinks.join(", ")}` : ""}`);
const dialogs = [...html.matchAll(/<dialog class="policy" id="([^"]+)"/g)].map((m) => m[1]);
const dialogLinks = [...new Set([...html.matchAll(/data-dialog="([^"]+)"/g)].map((m) => m[1]))];
const orphanDialogLinks = dialogLinks.filter((id) => !dialogs.includes(id));
check(dialogs.length > 0 && orphanDialogLinks.length === 0, `policy links open existing dialogs (${dialogs.length} dialogs: ${dialogs.join(", ")})`);
const footerPolicies = /<nav aria-label="Policies">([\s\S]*?)<\/nav>/.exec(html)?.[1] || "";
const notInFooter = dialogs.filter((id) => !footerPolicies.includes(`data-dialog="${id}"`));
check(dialogs.length > 0 && notInFooter.length === 0, `every policy is linked from the footer${notInFooter.length ? `: missing ${notInFooter.join(", ")}` : ""}`);

// 4. vercel.json
let config = null;
try { config = JSON.parse(readFileSync(vercelPath, "utf8")); } catch (e) { /* reported below */ }
check(!!config, "vercel.json exists and is valid JSON");
if (config) {
  check(config.outputDirectory === "site", 'vercel.json publishes the "site" folder only');
  const all = (config.headers || []).find((r) => r.source === "/(.*)")?.headers || [];
  const keys = all.map((h) => h.key.toLowerCase());
  for (const k of ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"]) {
    check(keys.includes(k), `vercel.json sends ${k} on every path`);
  }
  const csp = all.find((h) => h.key.toLowerCase() === "content-security-policy")?.value || "";
  check(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp), "CSP script-src has no 'unsafe-inline' or 'unsafe-eval'");
  check(/frame-ancestors 'none'/.test(csp), "CSP blocks framing (frame-ancestors 'none')");
  if (hasHome && csp) {
    const { needed, same } = compare(html, config);
    check(same, `CSP hashes match the ${needed.length} inline scripts (fix: node tools/csp-hashes.mjs --write)`);
  }
}

// 5. Secret-looking strings in published files
const files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
if (existsSync(site)) walk(site);
const patterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bsk_(live|test)_[A-Za-z0-9]{16,}\b/, "Stripe secret key"],
  [/\bsk-[A-Za-z0-9_-]{32,}\b/, "API secret key"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"]
];
const hits = [];
for (const f of files.filter((p) => /\.(html|js|css|json|txt|xml|svg)$/i.test(p))) {
  const text = readFileSync(f, "utf8").replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "");
  for (const [re, name] of patterns) if (re.test(text)) hits.push(`${name} in ${relative(root, f)}`);
}
const envFiles = files.filter((p) => /(^|[\\/])\.env/.test(p));
check(files.length > 0 && hits.length === 0 && envFiles.length === 0, `no secrets or .env files in site/ (${files.length} files scanned)${hits.length || envFiles.length ? `: ${[...hits, ...envFiles].join(", ")}` : ""}`);

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
