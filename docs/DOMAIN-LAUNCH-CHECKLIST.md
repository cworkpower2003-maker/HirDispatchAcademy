# Custom .com domain: what remains after you buy it

Everything that depends on the domain is generated from **one setting**, `productionOrigin` in `site.config.json`.
It is empty today, so the live site publishes no canonical tag, no `og:url`/`og:image`, no sitemap and no absolute
structured-data URLs. Nothing in this list has been done yet.

## 1. Buy and connect the domain (owner, in your registrar and Vercel dashboards)

- [ ] Buy the `.com` in the academy's own registrar account (not a staff member's personal account) and turn on 2-step verification there.
- [ ] Decide the main hostname: `www.yourdomain.com` (recommended on Vercel) or `yourdomain.com`.
- [ ] Vercel → project `hirdispatchacademy` → Settings → Domains → add **both** `yourdomain.com` and `www.yourdomain.com`.
- [ ] At the registrar, create **exactly the DNS records Vercel shows** for each name (usually an A record for the bare domain and a CNAME for `www`). Do not copy values from guides; Vercel shows the current ones.
- [ ] Wait until Vercel shows both names as "Valid Configuration" with an issued certificate.
- [ ] In Vercel, set the non-main hostname to **redirect** (308) to the main one.
- [ ] Check in a browser: `http://` and the other hostname both end up on `https://` + main hostname.

## 2. Switch the site to the domain (one commit, reviewed before push)

- [ ] Edit `site.config.json`: `"productionOrigin": "https://www.yourdomain.com"` (https, no trailing slash).
- [ ] Run, from the project folder:
  ```
  node tools/set-domain.mjs
  node tools/validate.mjs
  node tools/serve-local.mjs
  ```
  `set-domain` adds to every page: canonical, `og:url`, `og:image` (+ size, type, alt) and `twitter:image`; makes the
  JSON-LD `@id`/`url` values absolute and adds the organisation `url` and `logo`, Article `url`/`mainEntityOfPage`
  and BreadcrumbList markup; writes `site/sitemap.xml` with all five pages; adds the `Sitemap:` line to `robots.txt`.
- [ ] Review `git diff`, then commit and push. Vercel deploys automatically.
- [ ] Verify on the live domain:
  ```
  curl -sI https://www.yourdomain.com/
  curl -s https://www.yourdomain.com/sitemap.xml
  curl -s https://www.yourdomain.com/robots.txt
  ```
  and check that `<link rel="canonical">` on each page points at the domain, not `vercel.app`.

## 3. The old addresses

- [ ] `hirdispatchacademy.vercel.app` keeps working. Once the domain is live, its pages carry canonical tags pointing at the domain, which tells search engines which address is official. Optionally redirect it in Vercel → Domains.
- [ ] `hirdispatchacademy.netlify.app` and `hiracademyy.netlify.app` still serve old copies. Delete those Netlify projects, or replace them with a redirect to the new domain.

## 4. Search engines (owner accounts)

- [ ] Google Search Console → add a **Domain property** for `yourdomain.com` (verified by a DNS TXT record at the registrar).
- [ ] Submit `https://www.yourdomain.com/sitemap.xml` under Sitemaps.
- [ ] URL Inspection → test the home page and one guide → "Request indexing". Indexing is not guaranteed or instant.
- [ ] Optional: Bing Webmaster Tools → import from Search Console.
- [ ] Watch Search Console → Pages (indexing), Performance (queries, impressions, clicks, CTR, position) and Core Web Vitals over the following weeks.

## 5. Google Business Profile (only for the real Patran centre)

- [ ] If a profile already exists for the academy, claim/verify it; do not create a duplicate.
- [ ] Name exactly "HIR Dispatch Academy", the real address with PIN code, real opening hours, phone, website = the new domain.
- [ ] Choose a fitting primary category (for example a training-centre category) and add genuine photos of the centre.
- [ ] Ask real students for reviews after the course, without incentives. Never post or buy reviews.
- [ ] Use the same name, address and phone everywhere (website, profile, Instagram).

## 6. Business facts still needed for further SEO work

Not published anywhere until confirmed: PIN code, opening hours, course duration and fees (or "on enquiry"),
teaching language(s), software taught, certificate (if any), what placement support includes, other official
profiles (Facebook, YouTube) and the correct email spelling. Once confirmed they can go into `CONFIG` in
`site/index.html` (then run `node tools/csp-hashes.mjs --write`), the structured data and a software guide.

## Rollback

Set `productionOrigin` back to `""`, run `node tools/set-domain.mjs`, commit and push. This removes every
domain-dependent tag and the sitemap; the round trip is tested to restore the files byte for byte.
