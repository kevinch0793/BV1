# Application Answer Filler (Chrome extension)

Auto-drafts the **open-ended** (free-text) questions on a job-application page from
one of your resume profiles, and fills them into the form. Checkboxes, radios,
dropdowns, and short one-line inputs are ignored — only textareas / rich-text boxes.

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

## Everyday use
1. Open a job's application page (the form with the questions).
2. Click the extension's toolbar icon.
3. The open-ended fields fill with drafts; a corner toast reports how many.
4. **Read and edit every answer before you submit** — it drafts, you're the check.

## Notes & limits
- Works best on standard ATS (Greenhouse, Lever, Ashby). Heavily-scripted or deeply
  iframed forms (e.g. Workday) can be hit-or-miss — it does scan inside iframes.
- If nothing fills: make sure the App URL + token are set (clicking with either
  missing opens this options page), the token isn't revoked, and a profile is chosen
  in Settings. Errors show in the corner toast.
- The token grants answer-drafting for your account — treat it like a password;
  revoke and regenerate in Settings if it leaks.
