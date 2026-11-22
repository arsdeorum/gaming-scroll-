"""Copy the latest artifact pages into the Gaming Scroll repo and push.

Usage: python3 sync_site.py  (after saving both artifacts' index.html with Artifact read + path)
Only index.html and daily/index.html are touched.
"""
import json, os, re, subprocess, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("GS_REPO") or os.path.dirname(HERE)
# The two artifact pages, saved by "Artifact read" with path "index.html" (pass their paths in env vars).
TERM = os.environ["GS_TERM"]
DAILY = os.environ["GS_DAILY"]
APPROVED = os.path.join(HERE, "approved")

def run(*a, **k):
    return subprocess.run(a, cwd=REPO, text=True, capture_output=True, **k)

def add_link(s, marker_re, link, has):
    if has in s or '<a href="/terminal/"' in s and "Terminal" in link or '<a href="/"' in s and "DAILY" in link:
        return s  # page already has the link as a real anchor (script text does not count)
    m = list(re.finditer(marker_re, s))
    assert len(m) == 1, (marker_re, len(m))
    i = m[0].end()
    return s[:i] + "\n  " + link + s[i:]

def official_only(s):
    """Site rule (set by Diego's site session): only stories marked Official go online.
    Drop the others from DATA, and drop side-list rows that point to them."""
    import json
    m = re.search(r'const DATA = (\{.*?\});\n', s, re.S)
    d = json.loads(m.group(1))
    d["stories"] = [x for x in d["stories"] if x.get("v") == "official"]
    # Stories that passed the separate verification pass (Diego approved auto-publish).
    # Added only if the page does not already have the same id.
    try:
        have = {x["id"] for x in d["stories"]}
        es = json.load(open(os.path.join(APPROVED, "approved_es.json")))
        try:
            ru = json.load(open(os.path.join(APPROVED, "approved_ru.json")))
        except FileNotFoundError:
            ru = {}
        for x in json.load(open(os.path.join(APPROVED, "approved.json"))):
            if x["id"] not in have and x.get("v") == "official":
                x = {k: v for k, v in x.items() if k != "verified_n"}
                if x["id"] in es:
                    x["es"] = es[x["id"]]
                if x["id"] in ru:
                    x["ru"] = ru[x["id"]]
                d["stories"].append(x)
    except FileNotFoundError:
        pass
    keep = {x["id"] for x in d["stories"]}
    for k in ("cal", "fig", "enf"):
        if k in d:
            d[k] = [row for row in d[k] if len(row) < 4 or not isinstance(row[3], str) or not row[3] or row[3] in keep]  # story id is column 4
    out = json.dumps(d, ensure_ascii=False).replace("</", "<\\/")  # never close the script tag early
    return s[:m.start(1)] + out + s[m.end(1):]

CHECK_JS = os.path.join(__import__("tempfile").gettempdir(), "_gs_check.js")

def build():
    t = official_only(open(TERM).read())
    t = add_link(t, r'<span class="live">LIVE</span>',
                 '<a href="/" style="color:var(--amber)">DAILY &rarr;</a>', 'DAILY &rarr;')
    d = official_only(open(DAILY).read())
    # Diego: no story or archive counts in the Daily masthead. Hide them (the script still fills them).
    for bid in ("nStories", "nArc"):
        d = re.sub(r'<span>·</span><span><b id="%s">' % bid, '<span hidden>·</span><span hidden><b id="%s">' % bid, d)
    d = add_link(d, r'<span id="date">[^<]*</span>',
                 '<a href="/terminal/" class="lnk" style="font-weight:600;color:var(--navy)">Terminal view</a>',
                 'Terminal view')
    pages = {"index.html": t, "daily/index.html": d}
    for name, s in pages.items():
        assert "—" not in s, name + " has an em dash"
    # Stories go to shared data files (/data/), so a publish only changes the small files (Diego, 7 Nov).
    import json
    from split_data import split, load_data, DATA_RE
    full = {n: json.loads(DATA_RE.search(s).group(1)) for n, s in pages.items()}
    for name, s in split(pages, REPO).items():
        js = "\n".join(re.findall(r"<script>(.*?)</script>", s, re.S))
        open(CHECK_JS, "w").write(js)
        r = subprocess.run(["node", "--check", CHECK_JS], capture_output=True, text=True)
        assert r.returncode == 0, name + " script error: " + r.stderr[:300]
        open(f"{REPO}/{name}", "w", encoding="utf-8").write(s)
        assert load_data(f"{REPO}/{name}", REPO) == full[name], name + " split does not rebuild the same DATA"
    return full["daily/index.html"]

def write_status(daily, stamp):
    """status.json: a small public summary of what is online, so a run can check the live site after the deploy."""
    from verify_published import status_of
    st = {"stamp": stamp}
    st.update(status_of(daily))
    json.dump(st, open(f"{REPO}/status.json", "w"), indent=0)

def main():
  for attempt in range(2):
      run("git", "fetch", "-q", "origin", "main")
      run("git", "reset", "-q", "--hard", "FETCH_HEAD")
      daily = build()
      msg = sys.argv[1] if len(sys.argv) > 1 else "Sync pages from artifacts"
      has_status = os.path.exists(f"{REPO}/status.json")
      if has_status and not run("git", "status", "--porcelain", "index.html", "daily/index.html", "data").stdout.strip():
          print("no change"); sys.exit(0)
      write_status(daily, msg)
      if os.environ.get("DRY"):
          print("dry run: built, not committed"); sys.exit(0)
      run("git", "add", "-A", "index.html", "daily/index.html", "data", "status.json")
      run("git", "-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-qm",
          msg + "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"
          "Claude-Session: https://claude.ai/code/session_013V3RWd3gr2mtoQavTTQvti")
      p = run("git", "push", "-q", "origin", "main")
      if p.returncode == 0:
          print("pushed", run("git", "log", "--oneline", "-1").stdout.strip()); sys.exit(0)
      print("push failed:", p.stderr.strip()[-300:])
  sys.exit(1)


if __name__ == '__main__':
    main()
