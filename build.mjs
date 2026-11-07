/* Deploy-time minifier for The Gaming Scroll.
 *
 * Readable source stays in git so the news pipeline and future edits keep
 * working. Netlify runs this on every deploy and minifies only what it
 * serves: the standalone client scripts and the inline JS and CSS in the
 * pages. Story data in /data and the page markup are left alone.
 *
 * Safety first. The scheduled relay that pushes updates cannot fix a broken
 * build, so this script never fails the deploy: if the minifier is missing
 * or a file will not parse, that file is served as written and the build
 * still exits 0.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// Globals shared across separate <script> files, so they must keep their names.
const TERSER = {
  compress: { passes: 2 },
  mangle: { toplevel: false, reserved: ["GS_ADD", "GS_S", "DATA"] },
  format: { comments: false },
};
const JS_FILES = ["install.js", "t.js", "sw.js"];
const PAGES = [["index.html", "index"], ["daily/index.html", "daily/index"]];
const LANGS = ["en", "es", "ru"];
const HTML_FILES = ["index.html", "daily/index.html", "stats/index.html",
  ...PAGES.flatMap(([, b]) => [`${b}.es.html`, `${b}.ru.html`])];
const kb = (n) => (n / 1024).toFixed(1) + "kB";


/* One language per page.
 * Every story and rumour carries its text in English, Spanish and Russian, so
 * a reader downloaded all three. Here each page and each /data file gets one
 * copy per language, with that language's text in the main fields and the
 * other two removed. /es/ and /ru/ are routed to the .es.html and .ru.html
 * pages (netlify.toml). The page code is unchanged: with no s.es or s.ru left
 * it shows the main fields, which already hold the right language.
 */
function bake(o, lang, keys) {
  const e = lang !== "en" && o[lang];
  if (e) {
    for (const k of keys) if (e[k]) o[k] = e[k];
    if (e.b && e.b.length) o.b = e.b;
  }
  delete o.es; delete o.ru;
  return o;
}
const STORY_KEYS = ["t", "d", "mkt", "auth"], RUMOR_KEYS = ["t", "d", "mkt", "why"];
const js = (v) => JSON.stringify(v).replace(/<\//g, "<\\/");

async function splitLanguages() {
  // Safety net first: the Spanish and Russian routes must never 404, so each
  // gets a full copy of the page before the slimmer version is attempted.
  for (const [src, base] of PAGES) {
    if (!existsSync(src)) continue;
    const html = await readFile(src, "utf8");
    for (const l of ["es", "ru"]) await writeFile(`${base}.${l}.html`, html);
  }
  const done = new Set();
  for (const [src, base] of PAGES) {
    if (!existsSync(src)) continue;
    try {
      const html = await readFile(src, "utf8");
      const chunks = [...html.matchAll(/src="\/data\/([^"]+)\.js"/g)].map((m) => m[1]);
      for (const c of chunks) {
        if (done.has(c)) continue;
        const raw = await readFile(`data/${c}.js`, "utf8");
        const arr = JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")")));
        for (const l of LANGS) {
          const out = arr.map((x) => bake(JSON.parse(JSON.stringify(x)), l, STORY_KEYS));
          await writeFile(`data/${c}.${l}.js`, `GS_ADD(${js(out)});\n`);
        }
        done.add(c);
      }
      const at = html.indexOf("const DATA = ");
      const open = html.indexOf("})(", at) + 3;
      let depth = 0, end = -1, inStr = false;
      for (let i = open; i < html.length; i++) {
        const ch = html[i];
        if (inStr) { if (ch === "\\") i++; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (at < 0 || end < 0) throw new Error("DATA block not found");
      const data = JSON.parse(html.slice(open, end));
      for (const l of LANGS) {
        const d = JSON.parse(JSON.stringify(data));
        if (Array.isArray(d.rumors)) d.rumors = d.rumors.map((r) => bake(r, l, RUMOR_KEYS));
        let out = html.slice(0, open) + js(d) + html.slice(end);
        out = out.replace(/src="\/data\/([^"]+)\.js"/g, `src="/data/$1.${l}.js"`);
        await writeFile(l === "en" ? src : `${base}.${l}.html`, out);
        console.log(`[build] ${l === "en" ? src : base + "." + l + ".html"}: ${kb(html.length)} -> ${kb(out.length)} page`);
      }
    } catch (e) {
      console.log(`[build] language split skipped for ${src}: ${e.message}`);
    }
  }
}

async function run() {
  try { await splitLanguages(); } catch (e) { console.log("[build] language split failed:", e.message); }
  let minifyJs, minifyHtml;
  try {
    minifyJs = (await import("terser")).minify;
    minifyHtml = (await import("html-minifier-terser")).minify;
  } catch (e) {
    console.log("[build] minifier unavailable, serving source as-is:", e.message);
    return;
  }

  for (const f of JS_FILES) {
    if (!existsSync(f)) continue;
    try {
      const src = await readFile(f, "utf8");
      const out = await minifyJs(src, TERSER);
      if (out.code && out.code.length) {
        await writeFile(f, out.code);
        console.log(`[build] ${f}: ${kb(src.length)} -> ${kb(out.code.length)}`);
      }
    } catch (e) {
      console.log(`[build] skip ${f}: ${e.message}`);
    }
  }

  for (const f of HTML_FILES) {
    if (!existsSync(f)) continue;
    try {
      const src = await readFile(f, "utf8");
      const out = await minifyHtml(src, {
        collapseWhitespace: true,
        conservativeCollapse: true, // keep one space, so inline spacing never shifts
        removeComments: true,
        minifyCSS: true,
        minifyJS: TERSER,
        keepClosingSlash: true,
      });
      if (out && out.length) {
        await writeFile(f, out);
        console.log(`[build] ${f}: ${kb(src.length)} -> ${kb(out.length)}`);
      }
    } catch (e) {
      console.log(`[build] skip ${f}: ${e.message}`);
    }
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.log("[build] error, serving source as-is:", e && e.message);
    process.exit(0);
  }
);
