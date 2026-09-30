# ClipForge

ClipForge is a fast, browser-based workspace for planning short-form video clips. It provides a focused clip timeline, aspect-ratio choices, caption controls, a smart-cut suggestion, and export feedback without requiring a backend service.

## Run locally

```bash
npm start
```

Open `http://localhost:4173` in a browser.

## Quality checks

```bash
npm run check
npm test
```

## Deployment

The application is static: deploy the repository root to any static host (GitHub Pages, Cloudflare Pages, Netlify, or Vercel). The included GitHub Actions workflow validates syntax and tests on pushes and pull requests targeting `main`, then deploys the repository root to GitHub Pages when changes reach `main`. Enable **GitHub Pages → Source → GitHub Actions** once in the repository settings to activate the deployment.
