# Kobutai landing page

A static site with no build step: `index.html` (landing page, EN / 日本語 / 中文) and `privacy.html` (privacy policy, all three languages). The language follows the browser, can be forced with `?lang=en|ja|zh`, and is remembered once picked.

## Before launch

1. **Store link**: when the Chrome Web Store listing is live, paste its URL into `STORE_URL` near the top of the `<script>` in `index.html`. Until then every install button says "Coming soon" and links to GitHub.
2. **Social card**: `og:image` is relative (`assets/og.png`). Once you know the final address, change it to the full URL (for example `https://kobutai.app/assets/og.png`), because X, Slack and others need absolute URLs.
3. **Privacy URL for the Web Store**: use `<site address>/privacy.html`.

## Preview locally

```bash
python3 -m http.server 8000 -d site   # then open http://localhost:8000
```

## Hosting (all free)

| Host | Setup | Address |
|---|---|---|
| GitHub Pages | Repo Settings → Pages → Source: **GitHub Actions**. `.github/workflows/pages.yml` publishes `site/` on every push to `main`. | `https://<user>.github.io/<repo>/` |
| Cloudflare Pages | Workers & Pages → Create → Pages → connect the repo. Build command: *(empty)*. Output directory: `site`. | `https://<project>.pages.dev` |
| Netlify | Add new site → import the repo. Build command: *(empty)*. Publish directory: `site`. | `https://<name>.netlify.app` |

All three accept a custom domain later, and every path in the site is relative, so nothing needs changing when you move.

## Assets

- `assets/chars/*.webp`: one still frame per built-in character (album and footer).
- `assets/sheets/*.webp`: the extension's sprite sheets, loaded only when the demo or a hovered card animates.
- `assets/og.png`: 1200×630 social preview.
- Product Hunt gallery images (1270×760 @2x) live in `docs/marketing/producthunt/`, not on the site.

Fonts come from Google Fonts: ZCOOL KuaiLe (Latin and Chinese display) and Zen Maru Gothic (Japanese display).
