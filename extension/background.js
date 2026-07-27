// Application Answer Filler — MV3 background service worker.
// The in-page "Answer" button (content.js) messages { type: "fill" } here; this
// scrapes the page's open-ended fields, asks the app to draft answers from the
// configured profile, and fills them back in. Heavy DOM work runs as injected
// functions (scrape/fill) so it reaches every frame (iframed ATS forms).

async function getConfig() {
  const { appUrl, token } = await chrome.storage.sync.get(["appUrl", "token"]);
  return { appUrl: (appUrl || "").replace(/\/+$/, ""), token: token || "" };
}

// --- Resume downloads: keep the server's "First Last.pdf" name and OVERWRITE the
// previous file (no "(1)" suffix, no dialog) so the user always has one clean file to
// upload. Registered at the top level so the MV3 service worker wakes for the event.
// Only touches downloads from the configured app's /api/export/ endpoint; every other
// download is left to the browser's default behavior.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const url = item.finalUrl || item.url || "";
  if (!url.includes("/api/export/")) return; // not an app resume download → default
  chrome.storage.sync
    .get(["appUrl"])
    .then(({ appUrl }) => {
      const base = (appUrl || "").replace(/\/+$/, "");
      if (base && !url.startsWith(base)) return suggest(); // different origin → don't touch
      const name = (item.filename || "").split(/[\\/]/).pop() || "resume.pdf";
      suggest({ filename: name, conflictAction: "overwrite" });
    })
    .catch(() => suggest());
  return true; // suggest() is called asynchronously
});

// --- Injected into the page: find open-ended fields + their question labels. ---
function scrape() {
  const visible = (el) => !!(el.offsetParent || el.getClientRects().length) && !el.disabled && !el.readOnly;

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const labelFor = (el) => {
    // 1) Native association: <label for>, wrapping <label> (el.labels covers both).
    if (el.labels && el.labels.length) {
      const t = clean(Array.from(el.labels).map((l) => l.innerText).join(" "));
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && clean(l.innerText)) return clean(l.innerText);
    }
    // 2) ARIA.
    if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    for (const attr of ["aria-labelledby", "aria-describedby"]) {
      const ref = el.getAttribute(attr);
      if (ref) {
        const t = clean(ref.split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" "));
        if (t) return t;
      }
    }
    const wrap = el.closest("label");
    if (wrap && clean(wrap.innerText)) return clean(wrap.innerText);
    // 3) Walk up (Ashby & co. put the question in a label-like child OR a preceding
    // sibling of the field's container). Return the nearest match.
    const SEL =
      "label, legend, h1, h2, h3, h4, h5, [class*='label'], [class*='Label'], [class*='question'], [class*='Question'], [data-testid*='label'], [data-testid*='question'], [id*='label'], [id*='question']";
    let node = el;
    for (let up = 0; up < 6 && node; up++) {
      // preceding siblings of this node (skip any that are themselves a field)
      let sib = node.previousElementSibling;
      for (let n = 0; sib && n < 3; n++, sib = sib.previousElementSibling) {
        if (sib.querySelector && sib.querySelector("input, textarea, select, [contenteditable='true']")) break;
        const t = clean(sib.innerText);
        if (t && t.length >= 2 && t.length <= 300) return t;
      }
      node = node.parentElement;
      if (!node) break;
      const cand = node.querySelector(SEL);
      if (cand && clean(cand.innerText) && !cand.contains(el)) return clean(cand.innerText);
    }
    // 4) Fallbacks.
    if (el.getAttribute("name")) return clean(el.getAttribute("name").replace(/[_\-]+/g, " "));
    if (el.placeholder) return clean(el.placeholder);
    return "";
  };

  // A single-line <input> is only an open-ended QUESTION if its label reads like one...
  const isQuestion = (q) =>
    /\?\s*$/.test(q) ||
    /^(why|what|how|when|where|who|which|describe|explain|tell|share|list|do you|did you|have you|has your|are you|were you|would you|could you|can you|will you|is there|please\s+(describe|explain|tell|share|list))\b/i.test(q);
  // ...or it asks for a link/profile we can fill from the candidate's info.
  const isLink = (q) => /linked ?-?in|github|gitlab|portfolio|\bwebsite\b|\burl\b|personal (site|page|website)|profile (link|url)/i.test(q);
  const TEXT_INPUT = new Set(["", "text", "search", "url"]);
  // Custom dropdown/combobox widgets (e.g. <div class="select"> with a search input,
  // react-select) — never type free text into these.
  const inSelectWidget = (el) =>
    el.getAttribute("role") === "combobox" ||
    !!el.getAttribute("aria-autocomplete") ||
    !!el.closest('select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], .select, [class*="select__"], [class*="Select__"], [class*="dropdown"], [class*="combobox"], [class*="autocomplete"]');

  const els = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true']")).filter(visible);
  const fields = [];
  for (const el of els) {
    let short;
    if (el.tagName.toLowerCase() === "input") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (!TEXT_INPUT.has(type)) continue; // skip checkbox/radio/email/tel/number/file/date/...
      if (inSelectWidget(el)) continue; // skip custom <div class="select"> / combobox inputs
      short = true; // single-line input → one-line answer
    } else {
      if (inSelectWidget(el)) continue;
      short = false; // textarea / contenteditable → paragraph
    }
    const q = labelFor(el);
    if (!q) continue;
    const required = !!el.required || el.getAttribute("aria-required") === "true";
    // Inputs: only questions/link fields — UNLESS the field is required (then always
    // include it so a required question is never silently skipped). Textareas always.
    if (short && !required && !isQuestion(q) && !isLink(q)) continue;
    const id = "aiq-" + Math.random().toString(36).slice(2, 11);
    el.setAttribute("data-aiqid", id);
    fields.push({ id, question: q.replace(/\s+/g, " ").slice(0, 2000), short });
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

  // Bound the request so a busy/slow server never leaves the button stuck on
  // "Answering…" — abort after 60s with a clear message.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch(`${appUrl}/api/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questions: fields.map((f) => ({ question: f.question, short: f.short })), jobUrl, jobText }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? "Timed out — server busy, try again." : e && e.message ? e.message : "network error");
  } finally {
    clearTimeout(timer);
  }
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
