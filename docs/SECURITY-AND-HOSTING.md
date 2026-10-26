# HIR Dispatch Academy website: security, hosting and deployment

Last reviewed: 26 October 2026

## How the site works

- **Architecture:** one static HTML page, no framework, no build step, no `package.json`, no dependencies.
  Entry point: `site/index.html` (about 611 KB; about 343 KB with brotli, 360 KB with gzip). Fonts, photos and the
  logo are inlined as `data:` URIs, so a page view is **one HTTP request** with no other files to fetch.
- **Host disclosure:** the privacy policy names Vercel as the hosting provider (request logs: IP address, browser, time).
- **No backend:** no API, serverless function, database, cookies, analytics or third-party scripts. No environment
  variables or secrets are needed.
- **Enquiry form:** validated in the browser, then opens WhatsApp (`https://wa.me/917986369090?text=…`) with the
  details URL-encoded into the message. Nothing reaches the academy until the visitor presses Send in WhatsApp.
  This is not server-side form processing. The details do travel in the wa.me URL to WhatsApp (Meta), which the
  privacy policy states.
- **Policies:** six dialogs on the page, opened from the footer or by URL: `#privacy-policy`, `#terms-of-use`,
  `#security-policy`, `#cookie-policy`, `#course-disclaimer`, `#enrolment-refunds`. Owner-to-confirm notes are
  hidden on the live site and appear when the page is opened with `#placeholders`.

## Repository layout

| Path | Published? | Purpose |
|---|---|---|
| `site/` | Yes (Vercel output directory) | `index.html`, `og-image.jpg`, `robots.txt` |
| `vercel.json` | No | Output directory, build command, security headers |
| `tools/validate.mjs` | No | Pre-deploy checks; Vercel's build command |
| `tools/csp-hashes.mjs` | No | Computes/checks/writes the CSP script hashes in `vercel.json` |
| `tools/serve-local.mjs` | No | Local preview at http://127.0.0.1:8788 with the `vercel.json` headers applied |
| `docs/` | No | These notes and the launch templates (head tags, sitemap) |

Hosting history: the site was first published on Netlify (`hirdispatchacademy.netlify.app`, still live with the
pre-policy-update version). `netlify.toml` and `site/_headers` were removed when hosting moved to Vercel; they are in
the git history (commit 31deb1e) if ever needed.

## Editing the page safely

The Content-Security-Policy only lets an inline script run if its SHA-256 hash is listed. **Any edit inside a
`<script>` block, including the CONFIG block, changes its hash.** After such an edit:

```
node tools/csp-hashes.mjs --write
node tools/validate.mjs
node tools/serve-local.mjs
```

Open http://127.0.0.1:8788, check the console has no CSP errors, then commit `site/index.html` and `vercel.json`
together. Vercel runs `node tools/validate.mjs` as the build command, so a deploy with stale hashes, a missing file,
a broken in-page link or a missing security header fails instead of going live.

Editing text outside `<script>` blocks needs no hash update.

## Security headers (vercel.json)

| Header | Value / purpose |
|---|---|
| Content-Security-Policy | `default-src 'none'`; scripts only by hash (no `unsafe-inline`/`unsafe-eval`); images and fonts from the site and `data:`; `connect-src 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `base-uri 'none'`; `object-src 'none'`; `upgrade-insecure-requests` |
| Strict-Transport-Security | `max-age=63072000` (2 years). Without `includeSubDomains`/`preload`, so other subdomains of a future custom domain are not forced onto HTTPS without checking. Add them later only if every subdomain serves HTTPS. |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` (legacy fallback for `frame-ancestors`) |
| Referrer-Policy | `strict-origin-when-cross-origin` (wa.me, Instagram and Maps receive only the site's origin) |
| Permissions-Policy | camera, microphone, geolocation, payment, sensors, USB etc. switched off. Clipboard is left alone because "Copy number" uses it. |
| Cross-Origin-Opener-Policy | `same-origin` |

Limits of this policy: `style-src` keeps `'unsafe-inline'` because the approved design relies on `<style>` blocks
and `style=""` attributes. The risk is low because no user input is ever written into the page as HTML (all
dynamic text goes through `textContent` or an escaping helper). Headers reduce the impact of some attacks; they do
not make the site invulnerable.

Caching: HTML uses Vercel's default (`public, max-age=0, must-revalidate`, cached at the edge and purged on each
deploy), so returning visitors revalidate and get a small `304 Not Modified` instead of the full page, and a new
deploy is visible immediately. `og-image.jpg` is cached for one day.

## Traffic: what "10,000" means

| Measure | Meaning for this site | Transfer (measured sizes, compressed) |
|---|---|---|
| 10,000 HTTP requests | Each request for `/` returns the whole page; there are no sub-requests | ≈ 3.4 GB if all are full page loads, far less if many are 304 revalidations |
| 10,000 page views | 10,000 loads of the page = ≈ 10,000 requests | ≈ 3.4 GB |
| 10,000 unique visitors | Different people; each may view the page several times | ≈ 3.4 GB × average views per visitor |

All of this is static content served from Vercel's CDN. No request triggers server-side work, so there is no
function or database to overload and no function cost. No load test was run; nothing above is a guarantee.

### Vercel plan limits (from Vercel's published plan terms; NOT verified against the live account)

- **Hobby (free) is for personal, non-commercial use only.** HIR Dispatch Academy is a business, so the **Pro**
  plan is the appropriate one. This is a hosting decision for the owner.
- Hobby includes roughly 100 GB of data transfer and 1 million edge requests per month. If a limit is exceeded,
  Vercel can pause the project until the period resets or the plan is upgraded. At ~343 KB per view that is roughly
  290,000 page views a month.
- Pro includes more (about 1 TB transfer and 10 million edge requests a month) and then bills usage on demand. Set a
  **spend limit** (Settings > Billing > Spend Management) so a flood cannot create an unexpected bill.
- Check the current numbers on Vercel's pricing page before deciding; they change.

### Platform protection (Vercel dashboard; NEEDS HOSTING CONFIGURATION)

1. **DDoS mitigation** is applied automatically by Vercel on all plans. Nothing to configure.
2. **Attack Challenge Mode** (Firewall tab): turn on during an active attack to challenge all visitors with a
   browser check. Leave off normally.
3. **Firewall custom rules / rate limiting:** available on Vercel's firewall; the number of rules and rate-limiting
   features depend on the plan. For a static page these are optional; use them if abusive IPs, countries or bots
   show up in traffic.
4. **Spend management and usage notifications** (Pro): set before launch.
5. **Two-factor authentication** for every Vercel and GitHub account with access. Account takeover is a more
   realistic threat to this site than traffic.

Rate limiting in browser JavaScript would not stop an attacker, so none was added. `robots.txt` does not block
attackers; it only guides well-behaved crawlers.

### If abusive traffic is seen

1. Vercel > project > Observability / Firewall: identify the paths, IPs, user agents and countries.
2. Add a firewall rule to block or challenge the source, or enable Attack Challenge Mode.
3. Contact Vercel support with the request IDs (`x-vercel-id` header) if the platform mitigation is not enough.

## Deployment workflow

1. Commit locally.
2. Create (or choose) the GitHub repository, e.g. `hir-dispatch-academy` (private is fine), and push `main`.
3. Vercel > Add New > Project > import that repository. Framework preset: **Other**. Leave Root Directory as `./`.
   Build, install and output settings come from `vercel.json` (build `node tools/validate.mjs`, output `site`,
   no install step). No environment variables.
4. Production branch: `main`. Pull requests and other branches get preview URLs automatically.
5. Test the preview URL (checklist below), then promote/merge to `main` for production.
6. Verify production: `curl -sI https://YOUR-PROJECT.vercel.app/` should show every header in the table above.

Preview/production checklist: page loads at `/`; intro plays and a tap/key skips it; nav and mobile menu work; each
footer policy opens and closes; the Terms link to "Enrolment and refunds" works; WhatsApp buttons open the right
number; no console errors; headers present.

## If a form service is added later

Setting `CONFIG.formEndpoint` makes the page `fetch()` that URL, which `connect-src 'self'` blocks. Before going
live: add the service's origin to `connect-src` in `vercel.json`, rerun `node tools/csp-hashes.mjs --write` (CONFIG
changed), update the privacy and cookie policies, and rely on the service's own spam protection and rate limiting.
Any API key for it must stay in the service or in Vercel environment variables, never in the page.

## Launch checklist (once the production domain is confirmed)

- [ ] Add the domain in Vercel > Settings > Domains and let Vercel issue the certificate.
- [ ] Add the head tags from `docs/launch/head-tags-for-launch.html` with the real domain (then rerun the CSP tool only if a script changed; these are not scripts).
- [ ] Move `docs/launch/sitemap.xml` to `site/sitemap.xml` with the real domain, and uncomment the `Sitemap:` line in `site/robots.txt`.
- [ ] Decide what happens to the old Netlify sites (`hirdispatchacademy.netlify.app` and the older `hiracademyy.netlify.app`): delete them or replace them with a redirect, so outdated wording is not reachable.

## Items awaiting the academy owner

Open the page with `#placeholders` to see each note in place.

- Legal name of the business and the person handling privacy questions and grievances.
- Enrolment, payment, cancellation and refund terms (none are published; review by an Indian legal professional before publishing).
- What placement support, mentorship and doubt sessions include.
- Retention period for enquiries and student records, and the response time for privacy requests.
- Whether enquirers receive batch updates (needs separate consent).
- Handling of applicants under 18.
- Courts/jurisdiction for disputes, if one is to be named.
- The official email spelling (`hirdispatchacademy` vs `hirdispatchacedemy` on Instagram).
- Safeguards on the WhatsApp and email accounts (two-step verification, who has access).

All policy text should be reviewed by a qualified Indian legal professional. Publishing policies reduces risk; it does
not make the site immune to complaints or takedown requests.
