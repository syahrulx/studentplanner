# Aizztech website — Rencana privacy page

This folder contains the standalone Privacy Policy page for the **Rencana**
mobile app, branded for **Aizztech**. Apple App Review requires the policy to
be reachable at a public URL (listed in App Store Connect → App Privacy →
Privacy Policy URL).

## Target URL

```
https://aizztech.com/privacy/rencana
```

Must match the constant in `gradeup-mobile/src/constants/legal.ts`:

```ts
export const PRIVACY_POLICY_URL = 'https://aizztech.com/privacy/rencana';
```

If you ever change the URL, update that constant too, then rebuild the app.

## How to publish

1. Copy the `privacy/` folder (the one next to this README) into the **root**
   of your `aizztech.com` website project — so the final layout looks like:

   ```
   aizztech.com/
   ├── index.html            ← your existing homepage
   ├── privacy/
   │   └── rencana/
   │       └── index.html    ← from this folder
   └── …
   ```

2. Deploy your site the normal way (push to GitHub Pages / Vercel / Netlify /
   Cloudflare Pages / cPanel, etc.). No build step is required — it's a
   single static HTML file.

3. Verify both of these load in a browser with real content (no 404):

   - `https://aizztech.com/privacy/rencana`
   - `https://aizztech.com/privacy/rencana/` (with trailing slash)

   Most static hosts serve `index.html` automatically for both forms. If your
   host doesn't, add a redirect or name the file `rencana.html` and update
   the URL constant to `https://aizztech.com/privacy/rencana.html`.

## App Store Connect

Once live, paste the URL into:

- App Store Connect → **Your app** → **App Privacy** → **Privacy Policy URL**
- App Store Connect → **App Information** → **Privacy Policy URL** (localized
  version if any)

That's all Apple needs to clear Guideline 5.1.1(ii).
