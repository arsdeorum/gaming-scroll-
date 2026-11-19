"""Move the stories out of the two site pages into shared, cache-friendly data files.

Each page keeps a small inline header (story order, calendar, figures, enforcement rows).
The stories go into /data/<chunk>-<hash>.js files:
  - a story published this ISO week lives in its publish-day chunk (YYYY-MM-DD)
  - a story published in the last 35 days lives in a week chunk (YYYY-Www)
  - older stories live in a month chunk (YYYY-MM)
Chunk names carry a content hash, so a file that did not change keeps its URL and stays
in the reader's cache (served as immutable). Both pages and all languages share the files.
data/chunks.json remembers the publish day of every story id (not served, see netlify.toml).
"""
import datetime as dt, hashlib, json, os, re
from zoneinfo import ZoneInfo

DATA_RE = re.compile(r'const DATA = (\{.*?\});\n', re.S)
LOADER = '<script>var GS_S={};function GS_ADD(a){for(var i=0;i<a.length;i++)GS_S[a[i].id]=a[i]}</script>'
REBUILD = ('const DATA = (function(d){d.stories=d.order.map(function(i){return GS_S[i]})'
           '.filter(Boolean);delete d.order;if(d.rumors_file){d.rumors=window.GS_R||[];delete d.rumors_file}return d})(%s);\n')


def today():
    return dt.datetime.now(ZoneInfo("Europe/Madrid")).date()


def chunk_of(day, now):
    if day.isocalendar()[:2] == now.isocalendar()[:2]:
        return day.isoformat()
    if (now - day).days < 35:
        y, w, _ = day.isocalendar()
        return "%d-W%02d" % (y, w)
    return day.strftime("%Y-%m")


def split(pages, repo):
    """pages: {name: html with inline DATA}. Writes data files, returns {name: new html}."""
    now = today()
    mpath = os.path.join(repo, "data", "chunks.json")
    seen = json.load(open(mpath)) if os.path.exists(mpath) else {}
    parsed = {n: (h, DATA_RE.search(h)) for n, h in pages.items()}
    first_run = "_init_done" not in seen
    all_ids = set()
    for n, (h, m) in parsed.items():
        for s in json.loads(m.group(1))["stories"]:
            all_ids.add(s["id"])
            if s["id"] not in seen:
                # New story: today's chunk. On the first run (stories already online), use the event date.
                d = s.get("date") or now.isoformat()
                seen[s["id"]] = min(d, now.isoformat()) if first_run else now.isoformat()
    seen = {k: v for k, v in seen.items() if k in all_ids or k == "_init_done"}
    seen["_init_done"] = True
    os.makedirs(os.path.join(repo, "data"), exist_ok=True)
    keep, out = set(), {}
    for n, (h, m) in parsed.items():
        d = json.loads(m.group(1))
        groups = {}
        for s in d["stories"]:
            groups.setdefault(chunk_of(dt.date.fromisoformat(seen[s["id"]]), now), []).append(s)
        tags = []
        for c in sorted(groups):
            body = "GS_ADD(" + json.dumps(groups[c], ensure_ascii=False, separators=(",", ":")) + ");\n"
            fn = "%s-%s.js" % (c, hashlib.sha256(body.encode()).hexdigest()[:10])
            p = os.path.join(repo, "data", fn)
            if not os.path.exists(p):
                open(p, "w", encoding="utf-8").write(body)
            keep.add(fn)
            tags.append('<script src="/data/%s"></script>' % fn)
        if "rumors" in d:  # unconfirmed reports (task rule 10): one shared file of their own
            body = "window.GS_R=" + json.dumps(d["rumors"], ensure_ascii=False, separators=(",", ":")) + ";\n"
            fn = "rumors-%s.js" % hashlib.sha256(body.encode()).hexdigest()[:10]
            p = os.path.join(repo, "data", fn)
            if not os.path.exists(p):
                open(p, "w", encoding="utf-8").write(body)
            keep.add(fn)
            tags.append('<script src="/data/%s"></script>' % fn)
        head = {"order": [s["id"] for s in d["stories"]]}
        head.update({k: v for k, v in d.items() if k not in ("stories", "rumors")})
        if "rumors" in d:
            head["rumors_file"] = 1
        head_js = json.dumps(head, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        s_start = h.rfind("<script>", 0, m.start())
        assert s_start != -1 and h[s_start:m.start()].strip() == "<script>", n
        out[n] = (h[:s_start] + LOADER + "\n" + "\n".join(tags) + "\n" + h[s_start:m.start()]
                  + REBUILD % head_js + h[m.end():])
    for fn in os.listdir(os.path.join(repo, "data")):
        if fn.endswith(".js") and fn not in keep:
            os.remove(os.path.join(repo, "data", fn))
    json.dump(dict(sorted(seen.items())), open(mpath, "w"), ensure_ascii=False, indent=0)
    return out


def load(html_path, repo):
    """Story list of a site page, whether DATA is inline (old) or split (new)."""
    return load_data(html_path, repo)["stories"]


def load_data(html_path, repo):
    """Full DATA object of a site page, inline or split."""
    h = open(html_path, encoding="utf-8").read()
    m = DATA_RE.search(h)
    if m and m.group(1).startswith("{\"stories\""):
        return json.loads(m.group(1))
    m = re.search(r'const DATA = \(function\(d\)\{.*?\}\)\((\{.*?\})\);\n', h, re.S)
    head = json.loads(m.group(1).replace("<\\/", "</"))
    byid, rumors = {}, []
    for fn in re.findall(r'<script src="/data/([^"]+)"></script>', h):
        txt = open(os.path.join(repo, "data", fn), encoding="utf-8").read()
        if txt.startswith("window.GS_R="):
            rumors = json.loads(txt[len("window.GS_R="):-len(";\n")])
            continue
        for s in json.loads(txt[len("GS_ADD("):-len(");\n")]):
            byid[s["id"]] = s
    out = {"stories": [byid[i] for i in head["order"] if i in byid]}
    out.update({k: v for k, v in head.items() if k not in ("order", "rumors_file")})
    if head.get("rumors_file"):
        out["rumors"] = rumors
    return out
