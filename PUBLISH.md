# Putting this site on GitHub Pages

Same setup as the GROMACS visualizer: a public repo, Pages served by GitHub Actions, and
only the student pages published. The dashboard stays on your machine.

The licence allows this. RFD4-Proteina is BSD 3-Clause for both the code and the weights,
with no hosting restriction, so unlike BindCraft2 there is nothing here that stops a public
site.

## One file has to be made by hand first

The cloud session cannot write anything under `.github/workflows/`, which is a sensible
guard on GitHub Actions files. So that one file is not in the folder yet. Create it:

```bash
cd ~/Desktop/Code/MIP662_practice_tool/rfd4-visualizer
mkdir -p .github/workflows
cat > .github/workflows/pages.yml <<'YML'
# Publishes the student pages (not the dashboard) to GitHub Pages on every push to main.
# Settings > Pages > Source must be "GitHub Actions".
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
      - run: NOINDEX=1 bash tools/build_pages.sh _site
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deploy
        uses: actions/deploy-pages@v4
YML
```

## Then publish

```bash
cd ~/Desktop/Code/MIP662_practice_tool/rfd4-visualizer
chmod +x tools/build_pages.sh install.sh workflow/*.sh workflow/export_playback.py

# check it builds and passes before anything goes public
npm test
NOINDEX=1 bash tools/build_pages.sh _site

git init -b main
git add -A
git commit -m "RFD4 Visualizer: teaching site for RFD4-Proteina structure generation"
gh repo create bgeiss1/rfd4-visualizer --public --source=. --remote=origin --push
gh api -X POST repos/bgeiss1/rfd4-visualizer/pages -f build_type=workflow
```

If that last line complains that Pages already exists, set it in the web interface instead:
**Settings, then Pages, then Source: GitHub Actions**.

The site then lands at <https://bgeiss1.github.io/rfd4-visualizer/>, usually a minute or two
after the Actions run goes green.

## What gets published and what does not

`tools/build_pages.sh` copies the ten student pages, the CSS, the JavaScript, the vendored
3Dmol and everything in `data/`. It leaves out `admin.html`, `js/admin.js`, `serve.mjs`,
the tests and the capture scripts. Checked: `admin.html` returns 404 on the built site.

`NOINDEX=1` adds a `noindex, nofollow` meta to every page, so the site is reachable by link
but not listed by search engines. Drop the `NOINDEX=1` from the workflow when you want it
indexed, which is the one thing to change at launch.

## Afterwards

The dashboard's **Publish** button runs `git commit` and `git push` from this folder, so
once the remote exists, editing text in the dashboard and pressing Publish is all it takes
to update the live site.
