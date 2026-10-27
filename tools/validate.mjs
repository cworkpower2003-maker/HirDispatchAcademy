// Pre-deploy checks for the static site. Vercel runs this as the build command, so any failure stops the deploy.
//   node tools/validate.mjs
// Checks every page in site/: referenced local files exist, links between pages and to #sections resolve, policy
// dialogs are linked, each page has the basic SEO tags, JSON-LD parses, the FAQ structured data matches the visible
// FAQs, domain-dependent tags agree with site.config.json (and no placeholder domain ships), vercel.json keeps the
// security headers, the CSP hashes match the inline scripts, and no secret-looking strings are published.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, siteHtml, vercelPath } from "./csp-hashes.mjs";
import { compare as compareFaq } from "./faq-schema.mjs";
import { checkOrigin, config as siteConfig, expectedFiles, htmlPages, urlPath } from "./set-domain.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
const failures = [];
const check = (ok, message) => { console.log(`${ok ? "PASS" : "FAIL"}  ${message}`); if (!ok) failures.push(message); };
const list = (items, label) => (items.length ? `: ${label} ${items.slice(0, 8).join(", ")}${items.length > 8 ? ` (+${items.length - 8} more)` : ""}` : "");

// 1. Pages
const homePath = join(site, "index.html");
const hasHome = existsSync(homePath) && statSync(homePath).size > 0;
check(hasHome, "site/index.html exists and is not empty");
const pages = existsSync(site) ? htmlPages() : [];
const pageHtml = new Map(pages.map((p) => [p, readFileSync(p, "utf8")]));
const byUrl = new Map(pages.map((p) => [urlPath(p), p]));
const home = pageHtml.get(homePath) || "";
check(pages.length > 1, `${pages.length} HTML pages found: ${[...byUrl.keys()].join(", ")}`);

// 2. Local files and links. Page URLs are clean (no .html) as served with vercel.json "cleanUrls".
const missingFiles = [], brokenLinks = [];
let refCount = 0;
for (const [file, html] of pageHtml) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const name = relative(site, file);
  for (const [, attr, raw] of html.matchAll(/\s(src|href)="([^"]+)"/g)) {
    if (/^(?:[a-z]+:|\/\/|\$\{)/i.test(raw)) continue;           // external, mailto:, tel:, data:, template code
    refCount++;
    const [path, hash] = raw.split("#");
    if (!path) { if (hash && !ids.has(hash)) brokenLinks.push(`${name} -> #${hash}`); continue; }
    if (!path.startsWith("/")) { brokenLinks.push(`${name} -> ${raw} (use root-relative links)`); continue; }
    if (attr === "href" && byUrl.has(path)) {
      if (hash) {
        const target = pageHtml.get(byUrl.get(path));
        if (!new RegExp(`\\sid="${hash}"`).test(target)) brokenLinks.push(`${name} -> ${raw}`);
      }
      continue;
    }
    if (attr === "href" && path.endsWith(".html")) { brokenLinks.push(`${name} -> ${raw} (link to the clean URL without .html)`); continue; }
    if (!existsSync(join(site, path.slice(1)))) missingFiles.push(`${name} -> ${raw}`);
  }
}
// Files referenced from stylesheets, e.g. the fonts in assets/guide.css
const cssFiles = (function all(d) { return existsSync(d) ? readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? all(p) : p.endsWith(".css") ? [p] : []; }) : []; })(site);
for (const css of cssFiles) {
  for (const [, raw] of readFileSync(css, "utf8").matchAll(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g)) {
    refCount++;
    if (!existsSync(join(site, raw.split(/[?#]/)[0].slice(1)))) missingFiles.push(`${relative(site, css)} -> ${raw}`);
  }
}
check(refCount > 0 && missingFiles.length === 0, `local files referenced by the pages and stylesheets exist (${refCount} local references)${list(missingFiles, "missing")}`);
check(brokenLinks.length === 0, `links between pages and to #sections resolve${list(brokenLinks, "broken")}`);
for (const f of ["robots.txt", "og-image.jpg", "favicon.ico", "favicon-96x96.png", "apple-touch-icon.png"]) check(existsSync(join(site, f)), `site/${f} exists`);

// 3. Policy dialogs on the home page
const dialogs = [...home.matchAll(/<dialog class="policy" id="([^"]+)"/g)].map((m) => m[1]);
const dialogLinks = [...new Set([...home.matchAll(/data-dialog="([^"]+)"/g)].map((m) => m[1]))];
check(dialogs.length > 0 && dialogLinks.every((id) => dialogs.includes(id)), `policy links open existing dialogs (${dialogs.length} dialogs: ${dialogs.join(", ")})`);
const footerPolicies = /<nav aria-label="Policies">([\s\S]*?)<\/nav>/.exec(home)?.[1] || "";
check(dialogs.length > 0 && dialogs.every((id) => footerPolicies.includes(`data-dialog="${id}"`)), "every policy is linked from the home page footer");

// 4. Basic SEO on every page
const seo = [];
const titles = new Map(), descriptions = new Map();
for (const [file, html] of pageHtml) {
  const name = relative(site, file);
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  const desc = /<meta name="description" content="([^"]+)">/.exec(html)?.[1];
  if (!/<html lang="[a-z]{2}(-[A-Z]{2})?">/.test(html)) seo.push(`${name}: <html lang> missing`);
  if (!title || title.length < 20 || title.length > 75) seo.push(`${name}: title missing or not 20-75 characters`);
  if (!desc || desc.length < 70 || desc.length > 165) seo.push(`${name}: meta description missing or not 70-165 characters`);
  if ((html.match(/<h1\b/g) || []).length !== 1) seo.push(`${name}: needs exactly one <h1>`);
  if (!/<link rel="icon" href="\/favicon\.ico"/.test(html)) seo.push(`${name}: favicon link missing`);
  if (!/<meta name="viewport"/.test(html)) seo.push(`${name}: viewport meta missing`);
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) seo.push(`${name}: marked noindex`);
  for (const [, tag] of html.matchAll(/(<img\b[^>]*>)/g)) {
    if (!/\salt="/.test(tag)) seo.push(`${name}: <img> without alt`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) seo.push(`${name}: <img> without width/height`);
  }
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch { seo.push(`${name}: JSON-LD does not parse`); }
  }
  if (title) titles.set(title, [...(titles.get(title) || []), name]);
  if (desc) descriptions.set(desc, [...(descriptions.get(desc) || []), name]);
}
for (const [t, where] of [...titles, ...descriptions]) if (where.length > 1) seo.push(`duplicate title/description "${t.slice(0, 40)}…" on ${where.join(", ")}`);
check(seo.length === 0, `every page has lang, a 20-75 char title, a 70-165 char description, one h1, favicon, viewport, alt and image sizes, valid JSON-LD, no duplicates${list(seo, "problems")}`);

// 5. FAQ structured data
if (hasHome) {
  const faq = compareFaq(home);
  check(faq.same && faq.problems.length === 0, `FAQPage structured data matches the ${faq.included.length} visible FAQs (fix: node tools/faq-schema.mjs --write)${list(faq.problems, "problems")}`);
}

// 6. Domain-dependent tags
const origin = siteConfig.productionOrigin;
const originProblem = checkOrigin(origin);
check(!originProblem, `site.config.json productionOrigin is ${origin ? origin : "empty (no domain yet)"}${originProblem ? `: ${originProblem}` : ""}`);
if (!originProblem) {
  const stale = [...expectedFiles(origin)].filter(([f, want]) => (want === null ? existsSync(f) : !existsSync(f) || readFileSync(f, "utf8") !== want)).map(([f]) => relative(root, f));
  check(stale.length === 0, `canonical, og:url, og:image, JSON-LD URLs, sitemap.xml and robots.txt match site.config.json${list(stale, "out of step (run node tools/set-domain.mjs):")}`);
}
const placeholders = [];
for (const f of (existsSync(site) ? (function all(d) { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? all(p) : [p]; }); })(site) : [])) {
  if (!/\.(html|css|txt|xml|json)$/i.test(f)) continue;
  const text = readFileSync(f, "utf8");
  if (/PRODUCTION-DOMAIN|YOUR-DOMAIN|example\.com|\{\{[^}]*\}\}|hir-dryrun-test/i.test(text)) placeholders.push(relative(root, f));
  if (/<link rel="canonical"[^>]*\.(vercel|netlify)\.app/.test(text)) placeholders.push(`${relative(root, f)} (canonical on a platform subdomain)`);
}
check(placeholders.length === 0, `no placeholder domains or template variables in published files${list(placeholders, "found in")}`);

// 7. vercel.json
let config = null;
try { config = JSON.parse(readFileSync(vercelPath, "utf8")); } catch { /* reported below */ }
check(!!config, "vercel.json exists and is valid JSON");
if (config) {
  check(config.outputDirectory === "site", 'vercel.json publishes the "site" folder only');
  check(config.cleanUrls === true, "vercel.json serves pages at clean URLs (cleanUrls)");
  const all = (config.headers || []).find((r) => r.source === "/(.*)")?.headers || [];
  const keys = all.map((h) => h.key.toLowerCase());
  for (const k of ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"]) {
    check(keys.includes(k), `vercel.json sends ${k} on every path`);
  }
  const csp = all.find((h) => h.key.toLowerCase() === "content-security-policy")?.value || "";
  check(/default-src 'none'/.test(csp), "CSP default-src is 'none'");
  check(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp), "CSP script-src has no 'unsafe-inline' or 'unsafe-eval'");
  check(/frame-ancestors 'none'/.test(csp), "CSP blocks framing (frame-ancestors 'none')");
  check(!/(script|img|font|connect|style)-src[^;]*(https?:|\*)/.test(csp), "CSP allows no external origins");
  // Indexing safeguards: noindex only ever applies to *.vercel.app hosts, never to the production domain
  const hostRe = (c) => new RegExp(`^(?:${c.value})$`);
  const robotsRules = (config.headers || []).filter((r) => r.headers.some((h) => h.key.toLowerCase() === "x-robots-tag"));
  const unconditional = robotsRules.filter((r) => !(r.has || []).some((c) => c.type === "host"));
  check(unconditional.length === 0, "no X-Robots-Tag header applies to every host (it must be limited to preview hosts)");
  if (origin && !originProblem) {
    const prodHost = new URL(origin).hostname, apexHost = prodHost.replace(/^www\./, "");
    const hitsProd = robotsRules.filter((r) => r.has.some((c) => c.type === "host" && (hostRe(c).test(prodHost) || hostRe(c).test(apexHost))));
    check(hitsProd.length === 0, `production hosts ${prodHost} and ${apexHost} are not marked noindex`);
    check(robotsRules.some((r) => r.has.some((c) => c.type === "host" && hostRe(c).test("hirdispatchacademy-git-preview-team.vercel.app"))), "preview deployments (*.vercel.app) are marked noindex");
    const vercelRedirect = (config.redirects || []).find((r) => r.has?.some((c) => c.type === "host" && c.value === "hirdispatchacademy.vercel.app"));
    check(!!vercelRedirect && vercelRedirect.permanent === true && vercelRedirect.destination === `${origin}/:path*` && vercelRedirect.source === "/:path*",
      `hirdispatchacademy.vercel.app permanently redirects every path to ${origin}`);
  }
  if (hasHome && csp) {
    const { needed, same } = compare(siteHtml(), config);
    check(same, `CSP hashes match the ${needed.length} inline scripts across all pages (fix: node tools/csp-hashes.mjs --write)`);
  }
}

// 8. Secret-looking strings in published files
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
check(files.length > 0 && hits.length === 0 && envFiles.length === 0, `no secrets or .env files in site/ (${files.length} files scanned)${list([...hits, ...envFiles], "found")}`);

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
