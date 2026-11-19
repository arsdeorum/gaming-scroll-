# Publishing pipeline

These scripts copy the two artifact pages (terminal and Daily) to this repo, so Netlify publishes them.
The scheduled news task runs them at the end of each run. They are not served on the site (netlify.toml returns 404 for /pipeline/*).

Steps, from the repo root, after saving both artifact pages with Artifact read (path "index.html"):

    export GS_TERM=<saved terminal index.html> GS_DAILY=<saved Daily index.html>
    python3 pipeline/relay_check.py          # exit 1: a story would be lost or lacks es/ru, stop
    python3 pipeline/sync_site.py "News update <date> <time>"   # builds, commits, pushes; prints "no change" if nothing new
    NODE_PATH=$(npm root -g) node pipeline/render_check.cjs      # renders the six pages; every line must say errors 0

What sync_site.py does:
- keeps only stories marked "official" in DATA.stories, plus the approved verification-pass stories in `approved/` (with Spanish and Russian text);
- keeps DATA.rumors as it is;
- hides the story and archive counts in the Daily masthead and keeps the Daily and terminal cross-links;
- moves stories and rumors into shared, content-hashed files under /data/ (split_data.py), so a publish only sends new or changed files;
- checks for em dashes and script syntax, and checks that the split pages rebuild exactly the same data.

`DRY=1` builds without committing, but it first resets the repo to origin/main, so commit other edits before a test build.
The commit message is the first argument; never pass test flags as arguments.
