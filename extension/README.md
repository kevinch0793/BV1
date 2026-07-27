# Application Answer Filler (Chrome extension)

Auto-drafts the **open-ended** (free-text) questions on a job-application page from
one of your resume profiles, and fills them into the form. It fills text areas
(paragraph answers), single-line text inputs whose label reads like an open-ended
question ("Why us?", "Describe...") with a short, casual one-line answer, and
LinkedIn/GitHub/portfolio link fields (from your profile's links). Checkboxes,
radios, dropdowns / custom selects (e.g. `<div class="select">`), and other data
fields (name, email, phone) are left alone.
All answers use plain keyboard characters only (no em dashes or curly quotes).

It's the "hands"; the app is the "brain" (the `POST /api/answer` endpoint drafts
the answers from the profile you chose in **Settings → Application-answer extension**).

## One-time setup
1. In the app: **Settings → Application-answer extension** → pick the profile to
   *Answer as* → **Generate token** and copy it (shown once).
2. In Chrome: go to `chrome://extensions`, turn on **Developer mode** (top-right),
   click **Load unpacked**, and select this `extension/` folder.
3. Click the extension's **Details → Extension options** (or right-click the toolbar
   icon → Options) and paste:
   - **App URL** — your deployed app's base URL (e.g. `https://your-app.example.com`)
   - **API token** — the token from step 1
   Click **Save**.

## Status indicator
A small **"Answer"** button sits fixed in the bottom-right of every page:
- **Green "Answer"** = active (app URL + token are set).
- **Grey "Answer · set up"** = inactive; click it to open the options and configure.
The toolbar icon also shows a **"!"** badge until it's configured.

## Everyday use
1. Open a job's application page (the form with the questions).
2. Click the fixed **"Answer"** button in the bottom-right of the page.
3. The open-ended fields fill with drafts; the button reports how many (e.g. "Filled 3 ✓").
4. **Read and edit every answer before you submit** — it drafts, you're the check.

(Clicking the toolbar icon still works as a fallback.)

## Resume downloads (auto-overwrite)
When you click **Apply** on the app dashboard, your tailored resume downloads as a
fixed **`First Last.pdf`** (same name every time). This extension makes each new
download **silently replace** the previous `First Last.pdf` in your Downloads folder —
no `" (1)"` copies and no overwrite dialog — so you always have one clean file to
upload. Only downloads from your configured **App URL**'s export endpoint are affected;
all other downloads are left alone.

This uses the `downloads` permission, added in v1.1.0 — after updating, **Reload** the
extension at `chrome://extensions` (Developer mode → the extension's ⟳ Reload) so the
new permission takes effect.

## Notes & limits
- Works best on standard ATS (Greenhouse, Lever, Ashby). Heavily-scripted or deeply
  iframed forms (e.g. Workday) can be hit-or-miss — it does scan inside iframes.
- If nothing fills: make sure the App URL + token are set (clicking with either
  missing opens this options page), the token isn't revoked, and a profile is chosen
  in Settings. Errors show in the corner toast.
- The token grants answer-drafting for your account — treat it like a password;
  revoke and regenerate in Settings if it leaks.
