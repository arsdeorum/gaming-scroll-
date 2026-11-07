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
const HTML_FILES = ["index.html", "daily/index.html", "stats/index.html"];
const kb = (n) => (n / 1024).toFixed(1) + "kB";

async function run() {
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
