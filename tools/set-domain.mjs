// Writes everything that depends on the production domain from one setting: productionOrigin in site.config.json.
//
//   node tools/set-domain.mjs           apply site.config.json to the files in site/
//   node tools/set-domain.mjs --check   fail (exit 1) if any file differs from what the config produces
//
// While productionOrigin is "" (domain not bought yet) the site ships with NO domain-dependent tags: no canonical,
// og:url, og:image, absolute JSON-LD @id/url values, breadcrumbs markup, sitemap.xml or Sitemap line. Once it is set
// to e.g. "https://www.example-academy.com", running this tool adds all of them consistently to every page.
// It is safe to run repeatedly: each run first removes what a previous run wrote, then writes the current state.
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
export const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));

export const checkOrigin = (origin) => {
  if (origin === "") return null;
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(origin)) return "must look like https://www.example.com (https, lowercase, no path or trailing slash)";
  if (/example\.|production-domain|localhost|placeholder/i.test(origin)) return "is a placeholder, not a real domain";
  return null;
};

export const htmlPages = () => {
  const out = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".html")) out.push(p); } };
  walk(site);
  const home = join(site, "index.html");
  return out.sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
};
// URL path of a page as Vercel serves it with cleanUrls: index.html -> "/", guides.html -> "/guides"
export const urlPath = (file) => {
  const rel = relative(site, file).split(sep).join("/");
  return rel === "index.html" ? "/" : `/${rel.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`;
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const BLOCK = /(<!-- domain-tags:start[^>]*-->)[\s\S]*?(<!-- domain-tags:end -->)/;
const LD = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
const DOMAIN_KEYS = ["url", "logo", "mainEntityOfPage"];

const domainTags = (origin, path) => {
  if (!origin) return "\n";
  const img = config.shareImage;
  return `
<link rel="canonical" href="${origin}${path}">
<meta property="og:url" content="${origin}${path}">
<meta property="og:image" content="${origin}${img.path}">
<meta property="og:image:type" content="${img.type}">
<meta property="og:image:width" content="${img.width}">
<meta property="og:image:height" content="${img.height}">
<meta property="og:image:alt" content="${esc(img.alt)}">
<meta name="twitter:image" content="${origin}${img.path}">
<meta name="twitter:image:alt" content="${esc(img.alt)}">
`;
};

// Visible breadcrumb trail (nav.crumbs) as [name, path] pairs
const crumbs = (html, path) => {
  const nav = /<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
  if (!nav) return [];
  return [...nav.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, li]) => {
    const href = /href="([^"]+)"/.exec(li)?.[1] || path;
    return [li.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim(), href];
  });
};

const transformGraph = (graph, origin, path, html) => {
  const strip = (v) => (typeof v === "string" ? v.replace(/^https?:\/\/[^/#]+(\/[^#]*)?(?=#)/, "") : v);
  const nodes = graph["@graph"].filter((n) => n["@type"] !== "BreadcrumbList");
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const k of DOMAIN_KEYS) if (k in o && (k !== "url" || typeof o[k] === "string")) delete o[k];
    if (typeof o["@id"] === "string") o["@id"] = strip(o["@id"]);
    Object.values(o).forEach(walk);
  };
  walk(nodes);
  if (origin) {
    const base = `${origin}${path}`;
    const abs = (o) => {
      if (Array.isArray(o)) return o.forEach(abs);
      if (!o || typeof o !== "object") return;
      if (typeof o["@id"] === "string" && o["@id"].startsWith("#")) o["@id"] = `${base}${o["@id"]}`;
      Object.values(o).forEach(abs);
    };
    abs(nodes);
    for (const n of nodes) {
      if (n["@type"] === "EducationalOrganization") { n.url = `${origin}/`; n.logo = `${origin}${config.logoPath}`; }
      if (n["@type"] === "Article") {
        n.url = base; n.mainEntityOfPage = base;
        for (const who of [n.author, n.publisher]) if (who && typeof who === "object") who.url = `${origin}/`;
        if (n.publisher) n.publisher.logo = `${origin}${config.logoPath}`;
      }
    }
    const trail = crumbs(html, path);
    if (trail.length > 1) nodes.push({
      "@type": "BreadcrumbList",
      itemListElement: trail.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${origin}${href}` }))
    });
  }
  return { ...graph, "@graph": nodes };
};

export const expectedFiles = (origin = config.productionOrigin) => {
  const files = new Map();
  const pages = htmlPages();
  for (const file of pages) {
    const path = urlPath(file);
    let html = readFileSync(file, "utf8");
    if (!BLOCK.test(html)) throw new Error(`${relative(root, file)} has no domain-tags block`);
    html = html.replace(BLOCK, (_, a, b) => `${a}${domainTags(origin, path)}${b}`);
    const ld = LD.exec(html);
    if (ld) html = html.replace(LD, (_, a, json, c) => `${a}${JSON.stringify(transformGraph(JSON.parse(json), origin, path, html))}${c}`);
    files.set(file, html);
  }
  const robotsFile = join(site, "robots.txt");
  const robots = readFileSync(robotsFile, "utf8").replace(/\n*(#\s*)?Sitemap:.*$/gim, "").replace(/\n+$/, "\n");
  files.set(robotsFile, origin ? `${robots}\nSitemap: ${origin}/sitemap.xml\n` : robots);
  const sitemapFile = join(site, "sitemap.xml");
  files.set(sitemapFile, origin
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((f) => `  <url><loc>${origin}${urlPath(f)}</loc></url>`).join("\n")}\n</urlset>\n`
    : null);
  return files;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const origin = config.productionOrigin;
  const problem = checkOrigin(origin);
  if (problem) { console.error(`site.config.json productionOrigin "${origin}" ${problem}.`); process.exit(1); }
  const files = expectedFiles(origin);
  const stale = [...files].filter(([f, want]) => (want === null ? existsSync(f) : !existsSync(f) || readFileSync(f, "utf8") !== want)).map(([f]) => relative(root, f));
  if (process.argv[2] === "--check") {
    if (!stale.length) { console.log(`Domain OK: ${origin ? `all pages use ${origin}` : "no domain set, so no canonical, og:url, og:image, sitemap or absolute @id is published"}`); process.exit(0); }
    console.error(`Out of step with site.config.json: ${stale.join(", ")}\nRun: node tools/set-domain.mjs`);
    process.exit(1);
  }
  for (const [f, want] of files) { if (want === null) { if (existsSync(f)) unlinkSync(f); } else writeFileSync(f, want); }
  console.log(stale.length ? `Updated: ${stale.join(", ")}` : "Already up to date");
  console.log(origin ? `Domain set to ${origin}. Run node tools/csp-hashes.mjs --check and node tools/validate.mjs next.` : "No domain set: domain-dependent tags removed.");
}
