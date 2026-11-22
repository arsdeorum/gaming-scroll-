"""Write the small files the other scheduled tasks read instead of the full site pages.

Usage (repo root, after a verified publish):
    python3 pipeline/export_index.py            # writes .gs_index/* in the repo folder (git-ignored)
Files, to upload to the claude.ai Project with project_write (local_path):
    index-europe.json, index-latin-america.json, index-caribbean.json,
    index-africa.json, index-asia.json, index-oceania.json
        what is already published in that region: stories of the last 60 days
        [id, market code, date, headline] and all open rumors [id, market code, date, headline, sp].
        The research tasks read only their region's file.
    recent.json
        official stories of the last 8 days (English text, es and ru headline and summary) and the cal rows from today on,
        for the LinkedIn task.
Project paths: claude/index/<file>.
"""
import datetime as dt, json, os, sys
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from split_data import load_data

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("GS_REPO") or os.path.dirname(HERE)
OUT = os.environ.get("GS_INDEX_OUT", os.path.join(REPO, ".gs_index"))  # project_write uploads only from the working folder
REGIONS = {"Europe": "europe", "Latin America": "latin-america", "Caribbean": "caribbean",
           "Africa": "africa", "Asia": "asia", "Oceania": "oceania"}


def slim(s):
    """English story text plus the Spanish and Russian headline and summary: what the LinkedIn posts need."""
    o = {k: s[k] for k in ("id", "mk", "mkt", "auth", "cat", "date", "t", "d", "b", "src") if k in s}
    for lang in ("es", "ru"):
        if isinstance(s.get(lang), dict):
            o[lang] = {k: s[lang][k] for k in ("t", "d") if k in s[lang]}
    return o


def main():
    d = load_data(os.path.join(REPO, "daily/index.html"), REPO)
    today = dt.datetime.now(ZoneInfo("Europe/Madrid")).date()
    since60 = (today - dt.timedelta(days=60)).isoformat()
    since14 = (today - dt.timedelta(days=8)).isoformat()
    os.makedirs(OUT, exist_ok=True)
    stamp = today.isoformat()
    out = {slug: {"updated": stamp, "stories": [], "rumors": []} for slug in REGIONS.values()}
    other = []
    for s in d["stories"]:
        slug = REGIONS.get(s.get("reg"))
        if slug is None:
            other.append(s["id"])
        elif s.get("date", "") >= since60:
            out[slug]["stories"].append([s["id"], s.get("mk"), s.get("date"), s.get("t")])
    for r in d.get("rumors", []):
        slug = REGIONS.get(r.get("reg"))
        if slug:
            out[slug]["rumors"].append([r["id"], r.get("mk"), r.get("date"), r.get("t"), r.get("sp")])
    for slug, o in out.items():
        o["stories"].sort(key=lambda x: x[2] or "", reverse=True)
        json.dump(o, open(os.path.join(OUT, "index-%s.json" % slug), "w"), ensure_ascii=False, separators=(",", ":"))
    recent = {"updated": stamp,
              "stories": [slim(s) for s in d["stories"] if s.get("v") == "official" and s.get("date", "") >= since14],
              "cal": [r for r in d.get("cal", []) if r and r[0] >= stamp]}
    json.dump(recent, open(os.path.join(OUT, "recent.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    for f in sorted(os.listdir(OUT)):
        print("%-28s %7d bytes" % (f, os.path.getsize(os.path.join(OUT, f))))
    if other:
        print("note: %d stories with a region outside the six files: %s" % (len(other), other[:5]))


if __name__ == "__main__":
    main()
