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

## Add-friend deep links (Universal Links + WhatsApp tappable `https` URLs)

`rencana://` links are **not** tappable in WhatsApp and do not work when pasted
into a browser. The app now shares an **HTTPS** URL of the form:

`https://aizztech.com/community/add-friend?id=<userId>`

(Override with env `EXPO_PUBLIC_INVITE_HTTP_BASE` in `app.config.js` if you use
another host.)

### Publish these static files to `aizztech.com`

1. **Landing (when the app is not installed, or the link opens in a browser):**
   - Copy the folder `community/add-friend/` (contains `index.html`) next to
     `privacy/` on your site, so the URL
     `https://aizztech.com/community/add-friend?id=…` returns that HTML.
2. **iOS — Universal Links:** upload **without** a `.json` extension:
   - Path: `https://aizztech.com/.well-known/apple-app-site-association`
   - Content: use the file from this repo
     `legal/aizztech-website/.well-known/apple-app-site-association`
   - The server should serve it with `Content-Type: application/json` (many
     hosts do this for extensionless files under `.well-known/`).
3. **Android — App Links:** `https://aizztech.com/.well-known/assetlinks.json`
   - Replace `REPLACE_WITH_SHA256_FROM_GOOGLE_PLAY_APP_SIGNING` with the
     **SHA-256** certificate fingerprint from Google Play Console → your app
     → **App integrity** / **App signing** (or run `keytool` on your release
     keystore). The placeholder will **not** verify until replaced.
4. Rebuild the iOS and Android app after the native `associatedDomains` /
   `intentFilters` config (EAS `production` or `development` with a new binary).

Until AASA and `assetlinks` are live and a **new** app build is installed,
`https` links will open the **web page**; that page will try
`rencana://` and show **Open in Rencana** plus store links.
