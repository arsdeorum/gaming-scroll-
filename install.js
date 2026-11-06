/* The Gaming Scroll: offer to install the app.
   Chrome, Edge and Android: a small bar with an Install button that opens the browser's own install dialog.
   iPhone and iPad (Safari): the same bar with the two taps needed, since Safari has no install dialog.
   Not shown when the app is already installed, inside the app, or for 30 days after "Not now". */
(function () {
  try {
    if (!("serviceWorker" in navigator) && !/iphone|ipad|ipod/i.test(navigator.userAgent)) return;
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (standalone) return;
    var KEY = "gs-install-later", DAY = 864e5;
    var later = 0; try { later = +localStorage.getItem(KEY) || 0 } catch (e) {}
    if (Date.now() - later < 30 * DAY) return;

    var path = location.pathname;
    var lang = /^\/es(\/|$)/.test(path) ? "es" : /^\/ru(\/|$)/.test(path) ? "ru" : "en";
    var terminal = /terminal/.test(path) || path === "/index.html";
    var T = {
      en: { title: "Install The Gaming Scroll", body: "Open it from your home screen, full screen, and read saved pages offline.", go: "Install", no: "Not now", ok: "Got it",
            ios: "Tap the Share button, then “Add to Home Screen”." },
      es: { title: "Instala The Gaming Scroll", body: "Ábrela desde la pantalla de inicio, a pantalla completa, y lee sin conexión las páginas guardadas.", go: "Instalar", no: "Ahora no", ok: "Entendido",
            ios: "Toca el botón Compartir y luego “Añadir a pantalla de inicio”." },
      ru: { title: "Установите The Gaming Scroll", body: "Открывайте с домашнего экрана во весь экран и читайте сохраненные страницы без сети.", go: "Установить", no: "Не сейчас", ok: "Понятно",
            ios: "Нажмите «Поделиться», затем «На экран „Домой“»." }
    }[lang];

    var ua = navigator.userAgent;
    var ios = (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    var deferred = null, bar = null, shown = false;

    var css =
      ".gs-inst{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:50;width:min(520px,calc(100% - 32px));" +
      "transform:translate(-50%,16px);opacity:0;transition:transform 220ms cubic-bezier(0.23,1,0.32,1),opacity 220ms ease-out;" +
      "display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:center;padding:14px 16px;border-radius:6px;font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".gs-inst.in{transform:translate(-50%,0);opacity:1}" +
      ".gs-inst.out{transform:translate(-50%,10px);opacity:0;transition-duration:150ms}" +
      ".gs-inst img{grid-row:1 / span 2;width:44px;height:44px;border-radius:10px}" +
      ".gs-inst b{font-size:15px}" +
      ".gs-inst p{margin:0}" +
      ".gs-inst .row{grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end;margin-top:8px}" +
      ".gs-inst button{font:600 14px system-ui,-apple-system,'Segoe UI',sans-serif;border-radius:4px;padding:8px 14px;min-height:36px;cursor:pointer;transition:transform 160ms cubic-bezier(0.23,1,0.32,1)}" +
      ".gs-inst button:active{transform:scale(0.97)}" +
      ".gs-inst.daily{background:#FFFFFF;color:#14181F;border:1px solid #E2DCD6;box-shadow:0 8px 28px rgba(20,24,31,.18)}" +
      ".gs-inst.daily .go{background:#0B2E59;color:#fff;border:1px solid #0B2E59}" +
      ".gs-inst.daily .no{background:none;color:#0B2E59;border:1px solid #0B2E59}" +
      ".gs-inst.daily p{color:#5A616B}" +
      "@media (prefers-color-scheme:dark){.gs-inst.daily{background:#0F141B;color:#ECE7E2;border-color:#2B323C}.gs-inst.daily p{color:#A39C95}" +
      ".gs-inst.daily .go{background:#8FB4E8;color:#0F141B;border-color:#8FB4E8}.gs-inst.daily .no{color:#8FB4E8;border-color:#8FB4E8}}" +
      ".gs-inst.term{background:#0D1117;color:#D7DEE8;border:1px solid #1E2632;border-radius:2px;box-shadow:0 8px 28px rgba(0,0,0,.5);font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:13px}" +
      ".gs-inst.term p{color:#7C8899}.gs-inst.term b{color:#FFA028;text-transform:uppercase;letter-spacing:.04em;font-size:13px}" +
      ".gs-inst.term button{border-radius:2px;font-family:inherit;text-transform:uppercase;font-size:12px;letter-spacing:.04em}" +
      ".gs-inst.term .go{background:#FFA028;color:#1A0F00;border:1px solid #FFA028}.gs-inst.term .no{background:none;color:#D7DEE8;border:1px solid #1E2632}" +
      "@media (prefers-reduced-motion:reduce){.gs-inst,.gs-inst.in,.gs-inst.out{transition:none;transform:translate(-50%,0)}}";

    function close(remember) {
      if (!bar) return;
      if (remember) try { localStorage.setItem(KEY, String(Date.now())) } catch (e) {}
      var b = bar; bar = null;
      b.classList.add("out"); b.classList.remove("in");
      setTimeout(function () { b.remove() }, 200);
    }

    function show() {
      if (shown || document.querySelector(".ov.in,.ov:not([hidden])")) return;
      shown = true;
      var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
      bar = document.createElement("div");
      bar.className = "gs-inst " + (terminal ? "term" : "daily");
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", T.title);
      bar.innerHTML = '<img src="/icons/icon-192.png" alt="">' +
        "<b>" + T.title + "</b><p>" + (ios ? T.ios : T.body) + "</p>" +
        '<div class="row">' + (ios
          ? '<button type="button" class="go" data-a="ok">' + T.ok + "</button>"
          : '<button type="button" class="no" data-a="no">' + T.no + '</button><button type="button" class="go" data-a="go">' + T.go + "</button>") + "</div>";
      document.body.appendChild(bar);
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (bar) bar.classList.add("in") }) });
      bar.addEventListener("click", function (e) {
        var a = e.target.closest("button"); if (!a) return;
        if (a.dataset.a === "go" && deferred) {
          deferred.prompt();
          deferred.userChoice.then(function (c) { close(c && c.outcome !== "accepted") }).catch(function () { close(true) });
          deferred = null;
        } else close(true);
      });
      document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && bar) { close(true); document.removeEventListener("keydown", esc) } });
    }

    /* Wait a little so the bar never covers the page on first paint. */
    function soon() { setTimeout(show, 6000) }

    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; soon(); });
    window.addEventListener("appinstalled", function () { close(true) });
    if (ios) soon();
  } catch (e) {}
})();
