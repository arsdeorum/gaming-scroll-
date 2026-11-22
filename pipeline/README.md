# Publishing pipeline

Since 22 Nov 2026 this repo is the only source of the site. The scheduled news task does not read or
republish the Claude artifact pages any more. It writes only the new items of a run (a delta) and
these scripts merge them into the pages here.

Steps, from the repo root:

    python3 pipeline/add_items.py /tmp/items.json     # merges the delta, refuses bad input (exit 1), prints two export lines
    export GS_TERM=/tmp/gs_pages/term.html GS_DAILY=/tmp/gs_pages/daily.html
    python3 pipeline/relay_check.py                    # exit 1: a story would be lost or lacks es/ru, stop
    python3 pipeline/sync_site.py "News update <date> <time> Madrid"   # builds, commits, pushes; "no change" if nothing new
    NODE_PATH=$(npm root -g) node pipeline/render_check.cjs           # renders the six pages; every line must say errors 0
    python3 pipeline/verify_published.py <new story and rumor ids>     # exit 1: something is not in the pushed repo
    then fetch https://gamingscroll.net/status.json and compare it with the "LIVE MUST SHOW" line
    python3 pipeline/export_index.py                   # small files for the research and LinkedIn tasks

items.json format: see the docstring of add_items.py.

Fail check: an inbox file is marked "published" only when verify_published.py passes and the live
status.json shows the same stamp, counts and ids value. If not, the inbox stays "pending" and the next run tries again.

Index files (export_index.py, uploaded to the claude.ai Project under claude/index/):
- index-<region>.json: stories of the last 60 days [id, mk, date, headline] and open rumors, per region.
  Research tasks read only their region's file (a few KB) instead of the 4 MB pages.
- recent.json: official stories of the last 8 days and upcoming dates, for the LinkedIn task.

What sync_site.py does:
- keeps only stories marked "official" in DATA.stories, plus the approved verification-pass stories in `approved/`;
- keeps DATA.rumors as it is;
- hides the story and archive counts in the Daily masthead and keeps the Daily and terminal cross-links;
- moves stories and rumors into shared, content-hashed files under /data/ (split_data.py), so a push
  only sends new or changed files (usually today's chunk, the rumors file and the two small page headers);
- writes status.json;
- checks for em dashes and script syntax, and checks that the split pages rebuild exactly the same data.

`DRY=1` builds without committing, but it first resets the repo to origin/main, so commit other edits before a test build.
The commit message is the first argument; never pass test flags as arguments.
