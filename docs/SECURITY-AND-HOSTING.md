# HIR Dispatch Academy website: security, hosting and launch notes

Last reviewed: 26 October 2026

## How the site works

- **Hosting:** Netlify project `hirdispatchacademy` (Free plan), live at https://hirdispatchacademy.netlify.app.
  The live `index.html` was byte-identical to the approved file when this review began.
- **Architecture:** one static HTML page (`site/index.html`, about 611 KB, 343 KB with brotli). Fonts, photos and the logo are
  inlined as `data:` URIs. There is no backend, no serverless function, no database, no Netlify Forms, no cookies,
  no analytics and no third-party script.
- **Enquiry form:** validated in the browser, then opens WhatsApp (`wa.me`) with the details in the message. Nothing is
  sent to a server of ours. If `CONFIG.formEndpoint` is set later, see "If a form service is added" below.
- **Policies:** six dialogs on the page, opened from the footer or directly by URL:
  `#privacy-policy`, `#terms-of-use`, `#security-policy`, `#cookie-policy`, `#course-disclaimer`, `#enrolment-refunds`.
  Owner-to-confirm notes are hidden on the live site and appear when the page is opened with `#placeholders`.

## Repository layout

| Path | Published? | Purpose |
|---|---|---|
| `site/` | Yes (Netlify publish folder) | `index.html`, `og-image.jpg`, `robots.txt`, `_headers` |
| `netlify.toml` | No | Publish folder and the CSP check build command |
| `tools/csp-hashes.mjs` | No | Computes/checks the CSP hashes of the inline scripts |
| `tools/serve-local.mjs` | No | Local preview at http://127.0.0.1:8788 with `_headers` applied |
| `docs/` | No | These notes and the launch templates (head tags, sitemap) |

## Editing the page safely

The Content-Security-Policy only lets an inline script run if its SHA-256 hash is listed. **Any edit inside a
`<script>` block, including the CONFIG block, changes its hash.** After such an edit:

```
node tools/csp-hashes.mjs --write
node tools/serve-local.mjs
```

Open http://127.0.0.1:8788, check the browser console has no CSP errors, then commit `site/index.html` and
`site/_headers` together. Netlify's build runs `node tools/csp-hashes.mjs --check` and refuses to deploy stale hashes.
A drag-and-drop deploy skips that check, so run it yourself first.

Editing text outside `<script>` blocks needs no hash update.

## Security headers (site/_headers)

| Header | Value / purpose |
|---|---|
| Content-Security-Policy | `default-src 'none'`; scripts only by hash; images/fonts from the page itself and `data:`; `frame-ancestors 'none'`; `base-uri 'none'`; `object-src 'none'`; `form-action 'self'` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` (legacy fallback for `frame-ancestors`) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera, microphone, geolocation, payment, sensors, USB etc. switched off |
| Cross-Origin-Opener-Policy | `same-origin` |
| Strict-Transport-Security | Already sent by Netlify on `*.netlify.app` (`max-age=31536000; includeSubDomains; preload`). Not set in `_headers`; confirm it on the custom domain after launch. |

`style-src` keeps `'unsafe-inline'` because the approved design relies on `<style>` blocks and `style=""` attributes.
The risk is low because no user input is ever written into the page as HTML.

Cross-Origin-Resource-Policy and Cross-Origin-Embedder-Policy are deliberately not set: they add no protection to a
page with no secrets, and CORP could stop other sites from showing the share image.

## Traffic, abuse and "10,000 requests"

Every request is a static file served from Netlify's CDN. No request can start a server-side process, a function or a
database query, so there is no expensive endpoint to exhaust and no function cost to run up.

| Scenario | Expected behaviour |
|---|---|
| 10,000 visits spread over days or weeks | Normal traffic. About 3.4 GB of transfer (343 KB each, compressed). |
| 10,000 requests in one minute | Served from CDN cache; not a capacity problem for Netlify. The cost is bandwidth (~3.4 GB). |
| 10,000 simultaneous requests | Same as above; CDN edges absorb it. Not tested against the live site. |
| Coordinated malicious flood | Netlify's platform DDoS mitigation applies to all plans. Large or sustained floods mainly threaten the plan's **bandwidth allowance**, not availability of a server. |

None of this is guaranteed. The real risk for this site is **usage limits**: on the Free plan, exceeding the monthly
allowance can pause the site or require an upgrade. Check the current terms under Netlify > Team > Billing/Usage.
No load test was run against the live site.

Rate limiting written in browser JavaScript would not stop an attacker, so none was added. `robots.txt` does not block
attackers either; it only guides well-behaved crawlers.

### Needs hosting configuration (Netlify dashboard)

1. **Usage alerts:** enable bandwidth/usage notifications for the team so a flood is noticed early.
2. **Traffic rules / rate limiting / WAF:** Netlify offers firewall traffic rules (IP and geo blocking) and rate limiting
   on some paid plans. Check availability on the current plan before relying on them. For a static site these are
   optional; turn them on if abusive traffic is ever seen in the logs.
3. **Custom domain:** when connected, keep Netlify's automatic HTTPS (Let's Encrypt) on and "Force HTTPS" behaviour as
   default. Netlify already redirects `http://` to `https://` (verified on the netlify.app address).
4. **Deploy notifications / two-factor auth:** turn on 2FA for every Netlify team member; account takeover is a more
   realistic threat to this site than traffic.
5. **Old duplicate project:** `hiracademyy.netlify.app` serves an older version of the site with different wording.
   Decide whether to delete it or redirect it, so outdated claims are not reachable.

### If abusive traffic is seen

1. Netlify > project > Logs & metrics / Analytics: identify the paths, IPs and countries involved.
2. If the plan supports it, add a traffic rule to block or rate-limit the source.
3. Contact Netlify support with the request IDs (`X-Nf-Request-Id`) from the logs.
4. If needed, put the domain behind a dedicated DDoS/WAF provider. This is a larger change and should be planned.

## If a form service is added

Setting `CONFIG.formEndpoint` makes the page `fetch()` that URL, which the CSP currently blocks. Before going live:
add the service's origin to `connect-src` in `site/_headers`, rerun the hash tool, update the privacy and cookie
policies (the privacy policy switches its form paragraph automatically), and use the service's own spam protection and
rate limiting, because the page cannot enforce them.

## Launch checklist (once the production domain is confirmed)

- [ ] Add the head tags from `docs/launch/head-tags-for-launch.html` with the real domain.
- [ ] Move `docs/launch/sitemap.xml` to `site/sitemap.xml` with the real domain, and uncomment the `Sitemap:` line in `site/robots.txt`.
- [ ] Confirm `Strict-Transport-Security` is sent on the custom domain.
- [ ] Re-check the response headers: `curl -sI https://YOUR-DOMAIN/`.

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
