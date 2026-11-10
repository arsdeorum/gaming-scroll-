import type { Config, Context } from "@netlify/edge-functions";

// Adds two things to the news pages at the edge, so a page synced from the
// artifacts never needs to carry them itself:
// 1. the cookie-free visit counter (/t.js), before </body>
// 2. the app tags (manifest, icons, theme colour, service worker), before </head>
// 3. the install offer (/install.js), before </body>
// 4. link preview and search tags (Open Graph, canonical, hreflang), after <head>
export default async (request: Request, context: Context) => {
  // ?lang=es or ?lang=ru on an English address: send the reader to that
  // language's page, which carries only that language's text (see build.mjs).
  const url = new URL(request.url);
  const want = url.searchParams.get("lang");
  if (want === "es" || want === "ru" || want === "en") {
    const term = /terminal/.test(url.pathname) || url.pathname === "/index.html";
    const target = (want === "en" ? "" : "/" + want) + (term ? "/terminal/" : "/");
    const m = url.pathname.match(/^\/(es|ru)(\/|$)/);
    const cur = m ? m[1] : "en";
    if (cur !== want) {
      url.searchParams.delete("lang");
      const q = url.searchParams.toString();
      return Response.redirect(new URL(target + (q ? "?" + q : ""), url).toString(), 302);
    }
  }
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let html = await response.text();

  if (!html.includes('rel="manifest"')) {
    const path = new URL(request.url).pathname;
    const daily = !(/^\/(es\/|ru\/)?terminal/.test(path) || path === "/index.html");
    const lang = /^\/es(\/|$)/.test(path) ? "es" : /^\/ru(\/|$)/.test(path) ? "ru" : "";
    const theme = daily
      ? '<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">' +
        '<meta name="theme-color" content="#0F141B" media="(prefers-color-scheme: dark)">'
      : '<meta name="theme-color" content="#07090D">';
    const app =
      '<link rel="manifest" href="/manifest' + (lang ? '-' + lang : '') + '.webmanifest">' +
      theme +
      '<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">' +
      '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">' +
      '<meta name="apple-mobile-web-app-capable" content="yes">' +
      '<meta name="mobile-web-app-capable" content="yes">' +
      '<meta name="apple-mobile-web-app-title" content="Gaming Scroll">' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
      '<script>if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}</script>';
    const h = html.indexOf("</head>");
    html = h === -1 ? app + html : html.slice(0, h) + app + html.slice(h);
  }

  // 4. link preview and search tags (description, Open Graph, Twitter card,
  //    canonical, language alternates), per page and language, before </head>.
  if (!html.includes('property="og:title"')) {
    const path = new URL(request.url).pathname;
    const term = /^\/(es\/|ru\/)?terminal/.test(path) || path === "/index.html";
    const lang = /^\/es(\/|$)/.test(path) ? "es" : /^\/ru(\/|$)/.test(path) ? "ru" : "en";
    const SITE = "https://gamingscroll.net";
    const at = (l: string) => SITE + (l === "en" ? "" : "/" + l) + (term ? "/terminal/" : "/");
    const DESC: Record<string, string> = {
      en: "Regulatory news on regulated gambling markets worldwide, written from official sources: regulators, gazettes, parliaments and courts. Updated every day.",
      es: "Noticias regulatorias de los mercados de juego regulados de todo el mundo, a partir de fuentes oficiales: reguladores, boletines oficiales, parlamentos y tribunales. Actualización diaria.",
      ru: "Регуляторные новости рынков азартных игр по всему миру на основе официальных источников: регуляторов, официальных изданий, парламентов и судов. Обновляется ежедневно.",
    };
    const LOCALE: Record<string, string> = { en: "en_GB", es: "es_ES", ru: "ru_RU" };
    const ALT: Record<string, string> = {
      en: "The Gaming Scroll: regulatory news on regulated gambling markets",
      es: "The Gaming Scroll: noticias regulatorias del juego regulado",
      ru: "The Gaming Scroll: регуляторные новости рынков азартных игр",
    };
    const title = term ? "The Gaming Scroll Terminal" : "The Gaming Scroll Daily";
    const img = SITE + "/icons/og-image-" + lang + ".png";
    const q = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const meta =
      '<meta name="description" content="' + q(DESC[lang]) + '">' +
      '<link rel="canonical" href="' + at(lang) + '">' +
      ["en", "es", "ru"].map((l) => '<link rel="alternate" hreflang="' + l + '" href="' + at(l) + '">').join("") +
      '<link rel="alternate" hreflang="x-default" href="' + at("en") + '">' +
      '<meta property="og:type" content="website">' +
      '<meta property="og:site_name" content="The Gaming Scroll">' +
      '<meta property="og:title" content="' + title + '">' +
      '<meta property="og:description" content="' + q(DESC[lang]) + '">' +
      '<meta property="og:url" content="' + at(lang) + '">' +
      '<meta property="og:locale" content="' + LOCALE[lang] + '">' +
      ["en", "es", "ru"].filter((l) => l !== lang).map((l) => '<meta property="og:locale:alternate" content="' + LOCALE[l] + '">').join("") +
      '<meta property="og:image" content="' + img + '">' +
      '<meta property="og:image:width" content="1200">' +
      '<meta property="og:image:height" content="630">' +
      '<meta property="og:image:alt" content="' + q(ALT[lang]) + '">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + title + '">' +
      '<meta name="twitter:description" content="' + q(DESC[lang]) + '">' +
      '<meta name="twitter:image" content="' + img + '">';
    // Put the tags at the top of <head>, so crawlers that read only the first
    // tags see them before any other og:image.
    const h = html.indexOf("<head>");
    html = h === -1 ? meta + html : html.slice(0, h + 6) + meta + html.slice(h + 6);
  }

  if (!html.includes('src="/install.js"')) {
    const tag = '<script src="/install.js" defer></script>';
    const i = html.lastIndexOf("</body>");
    html = i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
  }

  if (!html.includes('src="/t.js"')) {
    const tag = '<script src="/t.js" defer></script>';
    const i = html.lastIndexOf("</body>");
    html = i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
};

export const config: Config = {
  path: ["/", "/index.html", "/terminal", "/terminal/", "/daily", "/daily/", "/daily/index.html", "/es", "/es/", "/es/terminal", "/es/terminal/", "/ru", "/ru/", "/ru/terminal", "/ru/terminal/"],
  onError: "bypass",
};
