// Local preview of site/ that behaves like the Vercel deployment: the response headers from vercel.json are applied
// (so the CSP is tested before deploy) and, with "cleanUrls", /guides/x serves guides/x.html while /guides/x.html
// redirects to /guides/x.
//   node tools/serve-local.mjs [port]      (default 8788, binds to 127.0.0.1 only)
// Header sources are matched as simple patterns ("/(.*)", "/images/(.*)" or an exact path), which is all vercel.json uses.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../site/", import.meta.url));
const port = Number(process.argv[2]) || 8788;
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json"
};

const vercel = JSON.parse(readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"));
// "(.*)" stays a wildcard; every other "." in a source is a literal dot
const toRegExp = (source) => new RegExp(`^${source.split("(.*)").map((part) => part.replace(/\./g, "\\.")).join("(.*)")}$`);
// "has": [{ "type": "host", "value": ... }] conditions; the value is matched against the whole host name
const hostOk = (has, host) => (has || []).every((c) => c.type !== "host" || new RegExp(`^(?:${c.value})$`).test(host));
const rules = (vercel.headers || []).map((r) => ({
  path: toRegExp(r.source),
  has: r.has,
  headers: r.headers.map((h) => [h.key, h.value])
}));
const isFile = (f) => { try { return f.startsWith(site) && statSync(f).isFile(); } catch { return false; } };

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname);
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  // Host redirects in the "/:path*" form that vercel.json uses; the query string is kept, as on Vercel
  for (const r of vercel.redirects || []) {
    if (r.source === "/:path*" && hostOk(r.has, host)) {
      res.writeHead(r.permanent ? 308 : 307, { Location: r.destination.replace("/:path*", url.pathname) + url.search }); res.end(); return;
    }
  }
  for (const r of rules) if (r.path.test(path) && hostOk(r.has, host)) for (const [k, v] of r.headers) res.setHeader(k, v);
  if (vercel.cleanUrls && path.endsWith(".html")) {
    res.writeHead(308, { Location: (path === "/index.html" ? "/" : path.slice(0, -5)) + url.search }); res.end(); return;
  }
  const rel = normalize(path).replace(/^[\\/]+/, "");
  const candidates = path.endsWith("/") ? [join(site, rel, "index.html")] : [join(site, rel), join(site, `${rel}.html`)];
  const file = candidates.find(isFile);
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`Serving site/ like Vercel on http://127.0.0.1:${port}`));
