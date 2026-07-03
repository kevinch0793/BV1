// Application Answer Filler — MV3 background service worker.
// The in-page "Answer" button (content.js) messages { type: "fill" } here; this
// scrapes the page's open-ended fields, asks the app to draft answers from the
// configured profile, and fills them back in. Heavy DOM work runs as injected
// functions (scrape/fill) so it reaches every frame (iframed ATS forms).

async function getConfig() {
  const { appUrl, token } = await chrome.storage.sync.get(["appUrl", "token"]);
  return { appUrl: (appUrl || "").replace(/\/+$/, ""), token: token || "" };
}

// --- Injected into the page: find open-ended fields + their question labels. ---
function scrape() {
  const visible = (el) => !!(el.offsetParent || el.getClientRects().length) && !el.disabled && !el.readOnly;

  const labelFor = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.innerText.trim()) return l.innerText.trim();
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ").trim();
      if (t) return t;
    }
    const wrap = el.closest("label");
    if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
    let node = el;
    for (let up = 0; up < 4 && node; up++) {
      node = node.parentElement;
      if (!node) break;
      const cand = node.querySelector("label, legend, h1, h2, h3, h4, [class*='label'], [class*='question']");
      if (cand && cand.innerText.trim() && !cand.contains(el)) return cand.innerText.trim();
    }
    if (el.placeholder) return el.placeholder.trim();
    return "";
  };

  const els = Array.from(document.querySelectorAll("textarea, [contenteditable='true']")).filter(visible);
  const fields = [];
  for (const el of els) {
    const q = labelFor(el);
    if (!q) continue;
    const id = "aiq-" + Math.random().toString(36).slice(2, 11);
    el.setAttribute("data-aiqid", id);
    fields.push({ id, question: q.replace(/\s+/g, " ").slice(0, 2000) });
  }
  return { jobUrl: location.href, jobText: (document.body?.innerText || "").slice(0, 8000), fields };
}

// --- Injected into the page: write answers into the tagged fields. ---
function fill(answersById) {
  const set = (el, val) => {
    if (el.isContentEditable) {
      el.textContent = val;
    } else {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
      if (desc && desc.set) desc.set.call(el, val);
      else el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  let n = 0;
  for (const el of document.querySelectorAll("[data-aiqid]")) {
    const id = el.getAttribute("data-aiqid");
    if (answersById[id] != null) {
      set(el, answersById[id]);
      n++;
    }
    el.removeAttribute("data-aiqid");
  }
  return n;
}

// --- Injected into the page: corner toast (toolbar-icon fallback only). ---
function toast(message, ok) {
  const d = document.createElement("div");
  d.textContent = message;
  d.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:66px;max-width:340px;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);background:" +
    (ok ? "#059669" : "#dc2626");
  document.documentElement.appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

// Scrape -> draft -> fill for one tab. Returns { filled }. Throws on error.
async function run(tabId) {
  const { appUrl, token } = await getConfig();
  if (!appUrl || !token) throw new Error("Not set up — open the extension options.");

  const scraped = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: scrape });
  const frames = scraped.map((r) => r.result).filter(Boolean);
  const fields = frames.flatMap((f) => f.fields);
  if (!fields.length) return { filled: 0 };

  const jobText = frames.map((f) => f.jobText).sort((a, b) => (b?.length || 0) - (a?.length || 0))[0] || "";
  const jobUrl = frames[0]?.jobUrl || "";

  const res = await fetch(`${appUrl}/api/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ questions: fields.map((f) => f.question), jobUrl, jobText }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const answersById = {};
  fields.forEach((f, i) => {
    if (answers[i] && answers[i].answer) answersById[f.id] = answers[i].answer;
  });

  const filledRes = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: fill, args: [answersById] });
  return { filled: filledRes.reduce((s, r) => s + (r.result || 0), 0) };
}

// The in-page button triggers this.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg && msg.type === "fill") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab" });
      return;
    }
    run(tabId)
      .then((r) => sendResponse({ ok: true, filled: r.filled }))
      .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : "failed" }));
    return true; // async response
  }
});

// Toolbar-icon fallback (the in-page "Answer" button is the primary trigger).
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const say = (m, ok) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toast, args: [m, ok] }).catch(() => {});
  const { appUrl, token } = await getConfig();
  if (!appUrl || !token) {
    chrome.runtime.openOptionsPage();
    return;
  }
  try {
    const { filled } = await run(tab.id);
    say(filled ? `Filled ${filled} answer(s). Review before submitting.` : "No open-ended questions found.", !!filled);
  } catch (e) {
    say(`Error: ${e && e.message ? e.message : "failed"}`, false);
  }
});

// Toolbar badge reflects active vs needs-setup.
async function updateBadge() {
  const { appUrl, token } = await getConfig();
  const active = !!(appUrl && token);
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
  chrome.action.setBadgeText({ text: active ? "" : "!" });
  chrome.action.setTitle({ title: active ? "Fill open-ended answers" : "Inactive — set the app URL + token (click)" });
}
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.appUrl || changes.token)) updateBadge();
});
