"""After a push: prove that the stories are really in the published repo, and print what the live site must show.

Usage (repo root, after sync_site.py):
    python3 pipeline/verify_published.py [story or rumor id ...]

Checks, against a fresh copy of origin/main (not the local folder):
  1. every id given as argument is in the published data (story ids on BOTH pages, rumor ids in the rumors file);
  2. if GS_TERM and GS_DAILY are set, every official story and every rumor of the two artifact pages is published;
  3. status.json matches the published data.
Exit 1 and a line starting with FAIL for each problem. Exit 0 prints "REPO OK" and the line
"LIVE MUST SHOW: ..." to compare with https://gamingscroll.net/status.json (the deployed copy).
Do not mark inbox files as published unless this passes AND the live status.json shows the same values.
"""
import hashlib, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from split_data import load_data, DATA_RE

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("GS_REPO") or os.path.dirname(HERE)


def status_of(daily):
    """The small public summary of what is online (written to status.json by sync_site.py)."""
    ids = sorted(s["id"] for s in daily["stories"])
    rum = sorted(r["id"] for r in daily.get("rumors", []))
    return {"stories": len(ids), "rumors": len(rum),
            "ids": hashlib.sha256("\n".join(ids + ["--"] + rum).encode()).hexdigest()[:12],
            "newest": max((s.get("date", "") for s in daily["stories"]), default="")}


def main():
    subprocess.run(["git", "fetch", "-q", "origin", "main"], cwd=REPO, check=True)
    pub = tempfile.mkdtemp()
    subprocess.run("git archive FETCH_HEAD | tar -x -C " + pub, shell=True, cwd=REPO, check=True)
    commit = subprocess.run(["git", "rev-parse", "--short", "FETCH_HEAD"], cwd=REPO, text=True,
                            capture_output=True).stdout.strip()
    pages = {"daily": load_data(os.path.join(pub, "daily/index.html"), pub),
             "terminal": load_data(os.path.join(pub, "index.html"), pub)}
    sid = {n: {s["id"] for s in d["stories"]} for n, d in pages.items()}
    rid = {n: {r["id"] for r in d.get("rumors", [])} for n, d in pages.items()}
    fails = []
    for i in sys.argv[1:]:
        for n in pages:
            if i not in (rid[n] if i.startswith("r-") else sid[n]):
                fails.append("%s is not published on the %s page" % (i, n))
    if sid["daily"] != sid["terminal"]:
        fails.append("the two pages differ in stories: %s" % sorted(sid["daily"] ^ sid["terminal"])[:10])
    if rid["daily"] != rid["terminal"]:
        fails.append("the two pages differ in rumors: %s" % sorted(rid["daily"] ^ rid["terminal"])[:10])
    for n, env in (("terminal", "GS_TERM"), ("daily", "GS_DAILY")):
        if os.environ.get(env):
            a = json.loads(DATA_RE.search(open(os.environ[env], encoding="utf-8").read()).group(1))
            miss = sorted({s["id"] for s in a["stories"] if s.get("v") == "official"} - sid[n])
            if miss:
                fails.append("%d official stories of the %s artifact page are not published: %s" % (len(miss), n, miss[:15]))
            missr = sorted({r["id"] for r in a.get("rumors", [])} - rid[n])
            if missr:
                fails.append("%d rumors of the %s artifact page are not published: %s" % (len(missr), n, missr[:15]))
    want = status_of(pages["daily"])
    sp = os.path.join(pub, "status.json")
    have = json.load(open(sp)) if os.path.exists(sp) else {}
    if {k: have.get(k) for k in want} != want:
        fails.append("status.json does not match the published data: %s vs %s" % (have, want))
    for f in fails:
        print("FAIL", f)
    if fails:
        sys.exit(1)
    print("REPO OK commit %s: %d ids checked, %d stories, %d rumors" % (commit, len(sys.argv) - 1, want["stories"], want["rumors"]))
    print("LIVE MUST SHOW: stamp=%r stories=%d rumors=%d ids=%s newest=%s" % (
        have.get("stamp"), want["stories"], want["rumors"], want["ids"], want["newest"]))


if __name__ == "__main__":
    main()
