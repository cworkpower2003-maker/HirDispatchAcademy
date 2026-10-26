// Local preview of site/ with the response headers from site/_headers applied, so the CSP is tested before deploy.
//   node tools/serve-local.mjs [port]      (default 8788, binds to 127.0.0.1 only)
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../site/", import.meta.url));
const port = Number(process.argv[2]) || 8788;
const types = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

// Minimal _headers parser: a path line (/* or an exact path) followed by indented "Name: value" lines
const rules = [];
for (const line of readFileSync(join(site, "_headers"), "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
  else { const i = line.indexOf(":"); rules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
}
const matches = (pattern, path) => pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = path === "/" ? "index.html" : normalize(path).replace(/^[\\/]+/, "");
  const file = join(site, rel);
  let ok = file.startsWith(site) && !rel.split(sep).some((p) => p.startsWith("_"));
  try { ok = ok && statSync(file).isFile(); } catch { ok = false; }
  for (const r of rules) if (matches(r.path, path)) for (const [k, v] of r.headers) res.setHeader(k, v);
  if (!ok) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`Serving site/ with _headers on http://127.0.0.1:${port}`));
