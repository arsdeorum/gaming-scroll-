"""Before a relay push: compare the artifact pages with what is online now.
Prints story counts and fails (exit 1) if a story would be lost or lacks Spanish/Russian text.
Works with the old inline pages and the split /data/ pages."""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from split_data import load, DATA_RE

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("GS_REPO") or os.path.dirname(HERE)
PAGES = {"terminal": os.environ["GS_TERM"], "daily": os.environ["GS_DAILY"]}

subprocess.run(["git", "fetch", "-q", "origin", "main"], cwd=REPO, check=True)
prev = tempfile.mkdtemp()
subprocess.run("git archive FETCH_HEAD | tar -x -C " + prev, shell=True, cwd=REPO, check=True)
online = {x["id"] for x in load(os.path.join(prev, "daily/index.html"), prev)}
appr = {x["id"] for x in json.load(open(os.path.join(HERE, "approved", "approved.json")))}
bad = False
for name, path in PAGES.items():
    st = json.loads(DATA_RE.search(open(path).read()).group(1))["stories"]
    off = [x for x in st if x.get("v") == "official"]
    lost = online - ({x["id"] for x in off} | appr)
    noes = [x["id"] for x in off if not x.get("es")]
    noru = [x["id"] for x in off if not x.get("ru")]
    print(name, "official", len(off), "online", len(online), "lost", sorted(lost), "no es", noes, "no ru", noru)
    bad |= bool(lost or noes or noru)
sys.exit(1 if bad else 0)
