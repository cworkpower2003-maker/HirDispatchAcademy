// Keeps the FAQPage structured data in site/index.html identical to the visible FAQ section.
//
//   node tools/faq-schema.mjs           print the questions and answers that go into the structured data
//   node tools/faq-schema.mjs --check   fail (exit 1) if the JSON-LD FAQPage differs from the visible FAQs
//   node tools/faq-schema.mjs --write   rewrite the FAQPage node in the page's JSON-LD @graph
//
// Answers that the page script can rewrite at runtime from CONFIG (data-course, data-next-answer,
// data-placement-faq) are left out, so the structured data can never disagree with what visitors see.
// Values filled from CONFIG with data-cfg are allowed only while the HTML already shows the CONFIG value.
// Editing the JSON-LD block does not affect the CSP: it is data, not an executable script.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const htmlPath = fileURLToPath(new URL("../site/index.html", import.meta.url));
const DYNAMIC = /\sdata-(course|next-answer|placement-faq)\b/;

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, "&");
const visibleText = (html) => decode(html
  .replace(/<(\w+)\b[^>]*\shidden\b[^>]*>[\s\S]*?<\/\1>/g, " ")   // hidden elements are not shown
  .replace(/<span class="plus"[^>]*><\/span>/g, "")
  .replace(/<\/p>\s*<p\b/g, "</p> <p")
  .replace(/<[^>]+>/g, ""))
  .replace(/\s+/g, " ").trim();

// CONFIG string values from the settings script, used to check data-cfg placeholders
const configValues = (html) => Object.fromEntries([...(/const CONFIG = \{([\s\S]*?)\n\};/.exec(html)?.[1] || "")
  .matchAll(/^\s{2}(\w+):\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]));

export const visibleFaqs = (html) => {
  const list = /<div class="faq-list">([\s\S]*?)\n {4}<\/div>/.exec(html)?.[1];
  if (!list) throw new Error("FAQ list (div.faq-list) not found in site/index.html");
  const cfg = configValues(html);
  const included = [], excluded = [], problems = [];
  for (const [, body] of list.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)) {
    const q = visibleText(/<summary>([\s\S]*?)<\/summary>/.exec(body)[1]);
    const answerHtml = /<div class="answer">([\s\S]*)<\/div>/.exec(body)[1];
    if (DYNAMIC.test(answerHtml)) { excluded.push(q); continue; }
    for (const [, key, shown] of answerHtml.matchAll(/data-cfg="(\w+)"[^>]*>([^<]*)</g)) {
      if (cfg[key] !== undefined && cfg[key] !== "" && cfg[key] !== decode(shown)) problems.push(`"${q}": shows ${shown} but CONFIG.${key} is ${cfg[key]}`);
    }
    included.push({ q, a: visibleText(answerHtml) });
  }
  return { included, excluded, problems };
};

const ldRe = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
export const readGraph = (html) => JSON.parse(ldRe.exec(html)[2]);
export const faqNode = (faqs) => ({
  "@type": "FAQPage",
  "@id": "#faq",
  mainEntity: faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
});

export const compare = (html) => {
  const { included, excluded, problems } = visibleFaqs(html);
  const node = readGraph(html)["@graph"].find((n) => n["@type"] === "FAQPage");
  // Only the questions and answers are compared: tools/set-domain.mjs may have made the @id absolute
  const same = !!node && JSON.stringify(node.mainEntity) === JSON.stringify(faqNode(included).mainEntity);
  return { same, included, excluded, problems, hasNode: !!node };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(htmlPath, "utf8");
  const mode = process.argv[2];
  const { same, included, excluded, problems } = compare(html);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  if (!mode) {
    for (const { q, a } of included) console.log(`Q: ${q}\nA: ${a}\n`);
    console.log(`Left out (filled from CONFIG at runtime): ${excluded.join(" | ")}`);
    process.exit(0);
  }
  if (mode === "--check") {
    if (same) { console.log(`FAQ OK: structured data matches ${included.length} visible FAQs (${excluded.length} runtime answers left out)`); process.exit(0); }
    console.error("FAQPage structured data does not match the visible FAQs. Run: node tools/faq-schema.mjs --write");
    process.exit(1);
  }
  if (mode === "--write") {
    const graph = readGraph(html);
    const node = faqNode(included);
    const i = graph["@graph"].findIndex((n) => n["@type"] === "FAQPage");
    if (i >= 0) graph["@graph"][i] = { ...node, "@id": graph["@graph"][i]["@id"] || node["@id"] }; else graph["@graph"].push(node);
    writeFileSync(htmlPath, html.replace(ldRe, (_, a, __, c) => `${a}${JSON.stringify(graph)}${c}`));
    console.log(same ? "FAQPage already up to date" : `FAQPage written with ${included.length} questions`);
    process.exit(0);
  }
  console.error(`Unknown option ${mode}`); process.exit(2);
}
