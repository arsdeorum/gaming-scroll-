"""Add a run's new items to the two site pages in this repo (the repo is the only source since 22 Nov 2026).

Usage (repo root):
    python3 pipeline/add_items.py items.json
It prints two lines to paste into the shell:
    export GS_TERM=/tmp/gs_pages/term.html
    export GS_DAILY=/tmp/gs_pages/daily.html
Then run relay_check.py, sync_site.py, render_check.cjs and verify_published.py as in README.md.

items.json (every key optional):
{
  "stories":  [story objects in site format, each with complete "es" and "ru"],
  "story_fixes": [{"id": "...", "set": {"t": "...", "b": [...], "es": {...}, "ru": {...}}}],
  "rumors":   [full rumor objects; an existing id is replaced, a new id is added],
  "rumors_remove": ["r-..."],
  "cal": [[date, mk, text, story id, es text, ru text]],
  "fig": [[value, label, mk, story id, es label, ru label, ru value]],
  "enf": [[mk, text, tag, story id, es text, es tag, ru text, ru tag]],
  "qa":  [{"en": {"t","id","h","l"}, "es": {...}, "ru": {...}}]   newest first,
  "today": {"id": "story id", "text": "one English sentence"}
}
The script refuses (exit 1) anything that would break a site rule it can check:
missing es/ru, paragraph counts that differ, em or en dashes, an id that already exists,
a row, QA entry or Today line that points to a missing story, a story without an official source.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from split_data import load_data

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("GS_REPO") or os.path.dirname(HERE)
OUT = os.environ.get("GS_OUT", "/tmp/gs_pages")
SPLIT_RE = re.compile(r'const DATA = \(function\(d\)\{.*?\}\)\((\{.*?\})\);\n', re.S)
QA_MAX = 8
errors = []


def err(msg):
    errors.append(msg)


def dashes(obj, where):
    s = json.dumps(obj, ensure_ascii=False)
    if "—" in s or "–" in s:
        err(where + " has an em or en dash")


def check_lang(o, where, keys):
    for lang in ("es", "ru"):
        e = o.get(lang)
        if not isinstance(e, dict):
            err("%s has no %s text" % (where, lang)); continue
        for k in keys:
            if k not in e:
                err("%s %s lacks %s" % (where, lang, k))
        if len(e.get("b", [])) != len(o.get("b", [])):
            err("%s %s has %d paragraphs, English has %d" % (where, lang, len(e.get("b", [])), len(o.get("b", []))))


def unsplit(name):
    """Page html with its full DATA inline again (the form sync_site.py reads)."""
    h = open(os.path.join(REPO, name), encoding="utf-8").read()
    d = load_data(os.path.join(REPO, name), REPO)
    m = SPLIT_RE.search(h)
    assert m, name + ": split DATA block not found"
    h = re.sub(r'<script>var GS_S=\{\};.*?</script>\n', '', h, flags=re.S)
    h = re.sub(r'<script src="/data/[^"]+"></script>\n', '', h)
    return h, d


def put_data(h, d):
    m = SPLIT_RE.search(h)
    js = "const DATA = " + json.dumps(d, ensure_ascii=False).replace("</", "<\\/") + ";\n"
    return h[:m.start()] + js + h[m.end():]


def qa_line(e):
    return "  {t:%s,id:%s,h:%s,l:%s}" % tuple(json.dumps(e[k], ensure_ascii=False) for k in ("t", "id", "h", "l"))


def add_qa(h, entries, ids):
    """Prepend entries to the three QA arrays of the Daily page and keep the newest QA_MAX."""
    blocks = [("ru", "const QA_RU = [\n", "\n];\nconst QA = RU ? QA_RU : ES ? [\n"),
              ("es", "\n];\nconst QA = RU ? QA_RU : ES ? [\n", "\n] : [\n"),
              ("en", "\n] : [\n", "\n];")]
    removed = None
    for lang, start, end in blocks:
        i = h.index(start) + len(start)
        j = h.index(end, i)
        old = [l.rstrip().rstrip(",") for l in h[i:j].split("\n") if l.strip()]
        new = []
        for e in entries:
            x = e[lang]
            if x.get("id") not in ids:
                err("QA entry points to a missing story: %s" % x.get("id"))
            if len(x.get("l", [])) != 4:
                err("QA entry %s (%s) needs 4 bullets" % (x.get("id"), lang))
            dashes(x, "QA entry " + str(x.get("id")))
            new.append(qa_line(x))
        allq = new + old
        removed = [re.search(r'id:"([^"]+)"', l).group(1) for l in allq[QA_MAX:]]
        h = h[:i] + ",\n".join(allq[:QA_MAX]) + h[j:]
    return h, removed


def main():
    items = json.load(open(sys.argv[1], encoding="utf-8"))
    pages = {"term": "index.html", "daily": "daily/index.html"}
    report = {}
    os.makedirs(OUT, exist_ok=True)
    for key, name in pages.items():
        h, d = unsplit(name)
        have = {s["id"] for s in d["stories"]}
        rum = {r["id"]: i for i, r in enumerate(d.get("rumors", []))}
        added = []
        for s in items.get("stories", []):
            w = "story " + s.get("id", "?")
            if s.get("id") in have:
                err(w + " already exists"); continue
            if s.get("v") != "official" or not any(len(x) > 2 and x[2] == "o" for x in s.get("src", [])):
                err(w + " is not official or has no official source")
            check_lang(s, w, ("mkt", "auth", "t", "d", "b"))
            dashes(s, w)
            s = {k: v for k, v in s.items() if k not in ("doc", "qa", "qa_entry", "cal", "fig", "enf")}
            d["stories"].insert(0, s); have.add(s["id"]); added.append(s["id"])
        byid = {s["id"]: s for s in d["stories"]}
        for f in items.get("story_fixes", []):
            if f["id"] not in byid:
                err("fix for missing story " + f["id"]); continue
            dashes(f["set"], "fix " + f["id"])
            byid[f["id"]].update(f["set"])
            check_lang(byid[f["id"]], "fixed story " + f["id"], ("t", "d", "b"))
        for r in items.get("rumors", []):
            w = "rumor " + r.get("id", "?")
            if not r.get("id", "").startswith("r-"):
                err(w + " id must start with r-")
            if r.get("id") in have:
                err(w + " has the id of a story")
            if not isinstance(r.get("sp"), int) or not 1 <= r["sp"] <= 5:
                err(w + " needs an integer sp from 1 to 5")
            check_lang(r, w, ("mkt", "t", "d", "b", "why"))
            dashes(r, w)
            if r["id"] in rum:
                d["rumors"][rum[r["id"]]] = r
            else:
                d.setdefault("rumors", []).insert(0, r); rum = {x["id"]: i for i, x in enumerate(d["rumors"])}
        gone = set(items.get("rumors_remove", []))
        if gone:
            d["rumors"] = [r for r in d["rumors"] if r["id"] not in gone]
        for k in ("cal", "fig", "enf"):
            for row in items.get(k, []):
                if len(row) < 4 or row[3] not in have:
                    err("%s row points to a missing story: %s" % (k, row[:4]))
                dashes(row, k + " row")
                d.setdefault(k, []).append(row)
        h = put_data(h, d)
        if key == "daily":
            if items.get("qa"):
                h, report["qa_removed"] = add_qa(h, items["qa"], have)
            t = items.get("today")
            if t:
                if t["id"] not in have:
                    err("Today line points to a missing story " + t["id"])
                dashes(t, "Today line")
                txt = t["text"].replace("&", "&amp;").replace("<", "&lt;")
                h, n = re.subn(r'(<span class="kicker red">Today</span>)<a href="#[^"]*" class="lnk" data-id="[^"]*">[^<]*</a>',
                               r'\1<a href="#%s" class="lnk" data-id="%s">%s</a>' % (t["id"], t["id"], txt.replace("\\", "\\\\")), h)
                if n != 1:
                    err("Today line not found on the Daily page")
        open(os.path.join(OUT, key + ".html"), "w", encoding="utf-8").write(h)
        report[key] = {"stories": len(d["stories"]), "rumors": len(d.get("rumors", [])), "added": added}
    if errors:
        for e in sorted(set(errors)):
            print("FAIL", e)
        sys.exit(1)
    print(json.dumps(report, ensure_ascii=False))
    print("export GS_TERM=%s/term.html" % OUT)
    print("export GS_DAILY=%s/daily.html" % OUT)


if __name__ == "__main__":
    main()
