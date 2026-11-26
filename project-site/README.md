# Project website

Use Node.js 22.13 or later in the 22.x series, or Node.js 24 or later. From `project-site/`, install dependencies with `npm ci` and start the development server with `npm run dev`. Open the local URL printed by Vite.

```sh
npm run test:evidence
npm run validate:evidence
npm run build
npm run preview
```

The build validates the manifest, type-checks the site, and writes the static website to `dist/`. Preview serves that production output locally. Any static server can serve the directory as a unit, including under a URL subpath.

## Add evidence

1. Review the generated report and every supporting file for public distribution. Remove credentials, private data, and unrelated run output. For an HTML report, preserve the relative layout of required assets and attachments.
2. Add the reviewed files under `public/evidence/`, for example `public/evidence/o2/freshness.json`. Vite copies files under `public/` into the build, so place only reviewed files there.
3. In `src/evidence.json`, add an `artifacts` entry to the corresponding objective with a `label` and a `path` such as `o2/freshness.json`. An optional `description` can record the run context. Use repository-relative Markdown paths in `references`. When adding a command with a working directory outside the workflow's existing path filters, update both event filters to cover that directory.
4. Run the tests, validation, and build above, then use preview to open the report and check its supporting files.

## Download the CI build

In the repository's **Actions** tab, open **Project Site CI**, select a successful run, and download **project-site-dist** from **Artifacts**. The archive is retained for 14 days. Extract it and serve its contents with a static server to view the built site.

The Actions artifact is a downloadable build archive. The Pages deployment hosts the same build at a public URL.

## Enable GitHub Pages

1. A repository admin or maintainer can open **Settings → Pages** and select **GitHub Actions** under **Build and deployment → Source**. The repository or organization must allow GitHub Actions and the official Pages actions.
2. In **Settings → Environments → github-pages**, if the environment exists, verify that its deployment rules allow `main`. An authorized maintainer can restrict the environment to `main` and configure any required approvals under the repository's deployment policy.
3. Once the workflow is on `main`, a qualifying push to `main` deploys automatically. To start a deployment manually, open **Actions → Project Site CI → Run workflow** and select `main`. Pull requests and manual runs on other branches validate and build only. Test, evidence validation, or build failures prevent deployment.

After a successful deployment, find the URL in **Settings → Pages** or on the workflow run's **github-pages** deployment. The expected URL with the default domain is `https://diegorobles2.github.io/puerto-rico-beach-monitoring/`.

For failures, open the **Project Site CI** run in **Actions**. Check the **build** job for test, validation, build, and Pages artifact upload errors. If the **deploy** job fails or waits for review, check its logs, the Pages source, and the `github-pages` environment's branch and approval rules.
