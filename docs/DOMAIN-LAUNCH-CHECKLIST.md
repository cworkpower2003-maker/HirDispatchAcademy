# Custom domain: status and remaining steps

Canonical host: **https://www.hirdispatchacademy.com** (set as `productionOrigin` in `site.config.json`).
Every domain-dependent tag is generated from that one setting by `node tools/set-domain.mjs`.

## 1. Domain connection: verified working on 27 October 2026

Checked from this project with public DNS (Google 8.8.8.8 and Cloudflare 1.1.1.1), curl and openssl:

| Check | Result |
|---|---|
| Nameservers | `ns01/ns02.domaincontrol.com` (GoDaddy DNS) |
| `hirdispatchacademy.com` A record | `216.198.79.1` (a Vercel address; the older `76.76.21.21` is not in use) |
| `www` CNAME | `ab35188970ad9f40.vercel-dns-017.com` (Vercel's project-specific target) |
| HTTPS certificates | Let's Encrypt for both `www` and the root, valid 27 Oct 2026 to 25 Jan 2027, renewed by Vercel automatically |
| `https://www.hirdispatchacademy.com/` | 200, serves the site |
| `https://hirdispatchacademy.com/...` | 308 to the same path and query on `www` |
| `http://www...` | 308 to `https://www...` (one hop) |
| `http://hirdispatchacademy.com/` | 308 to `https://hirdispatchacademy.com/`, then 308 to `www` (two hops; the http-to-https hop is done by Vercel before project rules run) |

No DNS change is needed. Keep the records Vercel shows in Project → Settings → Domains; do not copy values from
old notes.

## 2. Code changes on branch `feat/seo-custom-domain` (not yet in production)

- Canonical, `og:url`, `og:image` and `twitter:image` on every page point at `https://www.hirdispatchacademy.com`.
- JSON-LD uses absolute `@id`/`url` values, the organisation `url` and `logo`, and BreadcrumbList on guide pages.
- `site/sitemap.xml` lists the six public pages; `robots.txt` references it.
- `vercel.json`:
  - `hirdispatchacademy.vercel.app` → 308 to the same path on `https://www.hirdispatchacademy.com` (removes the
    duplicate copy of the site).
  - `X-Robots-Tag: noindex` on every other `*.vercel.app` host, so preview deployments are not indexed. The custom
    domain is never matched; `tools/validate.mjs` fails the build if that ever changes.

After merging to `main`, verify:
```
curl -sI https://www.hirdispatchacademy.com/            # 200, no X-Robots-Tag
curl -s  https://www.hirdispatchacademy.com/sitemap.xml # 6 URLs
curl -sI https://hirdispatchacademy.vercel.app/guides   # 308 to https://www.hirdispatchacademy.com/guides
```

## 3. The old addresses

- [ ] `hirdispatchacademy.netlify.app` and `hiracademyy.netlify.app` still serve old copies with different wording.
      Delete those Netlify projects, or set them to redirect to `https://www.hirdispatchacademy.com`.

## 4. Google Search Console (owner account; nothing has been set up yet)

No `google-site-verification` TXT record or meta tag exists today.

1. Go to https://search.google.com/search-console → Add property → **Domain** → enter `hirdispatchacademy.com`.
2. Google shows a TXT value starting with `google-site-verification=`. Copy it exactly.
3. GoDaddy → My Products → `hirdispatchacademy.com` → DNS → Add record: Type **TXT**, Name **@**, Value = the copied
   text, TTL default. Do not change or delete the existing A and CNAME records.
4. Back in Search Console, click Verify (DNS changes can take from minutes to a few hours).
5. Sitemaps → submit `https://www.hirdispatchacademy.com/sitemap.xml`.
6. URL Inspection → enter `https://www.hirdispatchacademy.com/` → Test live URL → Request indexing. Repeat for
   `/guides` and each guide if you want them crawled sooner. Indexing is never guaranteed or instant.
7. Over the following weeks review: Pages (indexing and any excluded URLs), Performance (queries, impressions,
   clicks, CTR, average position, top pages), and Core Web Vitals.
8. Optional: Bing Webmaster Tools → import the property from Search Console.

## 5. Google Business Profile (only for the real Patran centre)

- [ ] If a profile already exists for the academy, claim/verify it; do not create a duplicate.
- [ ] Name exactly "HIR Dispatch Academy", the real address with PIN code, real opening hours, phone, and website
      `https://www.hirdispatchacademy.com/`.
- [ ] A fitting primary category and genuine photos of the centre.
- [ ] Reviews only from real students, asked for after the course, without incentives.
- [ ] Use the same name, address and phone everywhere (website, profile, Instagram).

## 6. Business facts still needed

Not published until confirmed: PIN code, opening hours, course duration and fees (or "on enquiry"), teaching
language(s), software taught (needed before a load-board guide), certificate (if any), what placement support
includes, other official profiles, and the correct email spelling.

## Rollback

Set `productionOrigin` back to `""` and run `node tools/set-domain.mjs` to remove every domain-dependent tag and the
sitemap; remove the `redirects` entry in `vercel.json` to stop redirecting the vercel.app host. Or revert the
merge commit on `main`.
