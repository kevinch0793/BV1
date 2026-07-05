// Injected into the top frame of every page: a fixed "Answer" button. It shows
// whether the extension is configured and, when clicked, asks the background
// worker to fill the page's open-ended questions. The button is re-added if the
// page (especially a single-page app) ever removes or re-renders over it, so it
// reliably stays visible without needing the toolbar icon.
(() => {
  if (window.top !== window) return; // top frame only

  const BASE =
    "position:fixed;z-index:2147483646;right:18px;bottom:18px;padding:9px 14px;border:0;border-radius:999px;" +
    "font:600 13px/1 system-ui,-apple-system,sans-serif;color:#fff;box-shadow:0 3px 12px rgba(0,0,0,.28);" +
    "cursor:pointer;display:flex;align-items:center;gap:7px;opacity:.85;transition:opacity .15s;";

  let btn = null;
  let configured = false;
  let busy = false;

  const dot = (c) => `<span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>`;

  function render(state, label, title) {
    if (!btn) return;
    const bg = state === "inactive" ? "#6b7280" : state === "busy" ? "#0369a1" : "#059669";
    btn.style.cssText = BASE + "background:" + bg + ";";
    btn.innerHTML = dot(state === "inactive" ? "#f59e0b" : "#a7f3d0") + "<span>" + label + "</span>";
    if (title) btn.title = title;
  }

  async function refresh() {
    if (busy) return;
    const { appUrl, token } = await chrome.storage.sync.get(["appUrl", "token"]);
    configured = !!(appUrl && token);
    configured
      ? render("active", "Answer", "Fill the open-ended answers on this page")
      : render("inactive", "Answer · set up", "Inactive — click to set the app URL + token");
  }

  async function onClick() {
    if (busy) return;
    if (!configured) {
      chrome.runtime.sendMessage({ type: "openOptions" });
      return;
    }
    busy = true;
    render("busy", "Answering…");
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "fill" });
    } catch {
      res = { ok: false, error: "Extension reloaded — refresh the page." };
    }
    busy = false;
    if (res && res.ok) render("active", res.filled ? "Filled " + res.filled + " ✓" : "No questions found", res.filled ? "Review before submitting" : "");
    else render("inactive", "Error", (res && res.error) || "Failed");
    setTimeout(refresh, 3000);
  }

  // Create the button if it's missing. Safe to call repeatedly.
  function mountFab() {
    if (document.getElementById("aiq-fab")) {
      btn = document.getElementById("aiq-fab");
      return;
    }
    if (!document.documentElement) return;
    btn = document.createElement("button");
    btn.id = "aiq-fab";
    btn.type = "button";
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = ".85"));
    btn.addEventListener("click", onClick);
    // Append to <html> (sibling of <body>) so SPA re-renders of the body don't drop it.
    document.documentElement.appendChild(btn);
    refresh();
  }

  mountFab();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.appUrl || changes.token)) refresh();
  });

  // If the page ever removes it (full-document swap / SPA), put it back instantly.
  try {
    new MutationObserver(() => {
      if (!document.getElementById("aiq-fab")) mountFab();
    }).observe(document.documentElement, { childList: true });
  } catch {
    /* ignore */
  }
  // Belt-and-suspenders: re-ensure every few seconds and on bfcache restore.
  setInterval(() => {
    if (!document.getElementById("aiq-fab")) mountFab();
  }, 2500);
  window.addEventListener("pageshow", () => mountFab());
})();
