// Local preview of site/ with the response headers from vercel.json applied, so the CSP is tested before deploy.
//   node tools/serve-local.mjs [port]      (default 8788, binds to 127.0.0.1 only)
// Header sources are matched as simple patterns ("/(.*)" or an exact path), which is all vercel.json uses here.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../site/", import.meta.url));
const port = Number(process.argv[2]) || 8788;
const types = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

const vercel = JSON.parse(readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"));
const rules = (vercel.headers || []).map((r) => ({
  path: new RegExp(`^${r.source.replace(/\./g, "\\.")}$`),
  headers: r.headers.map((h) => [h.key, h.value])
}));
const matches = (pattern, path) => pattern.test(path);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = path === "/" ? "index.html" : normalize(path).replace(/^[\\/]+/, "");
  const file = join(site, rel);
  let ok = file.startsWith(site);
  try { ok = ok && statSync(file).isFile(); } catch { ok = false; }
  for (const r of rules) if (matches(r.path, path)) for (const [k, v] of r.headers) res.setHeader(k, v);
  if (!ok) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`Serving site/ with _headers on http://127.0.0.1:${port}`));
