# Deploying to Firebase Hosting

Firebase Hosting gives you a free `https://YOUR-PROJECT.web.app` URL you can
open on any device, including your phone.

## One-time setup

1. **Install the Firebase CLI** (needs Node.js installed):
   ```
   npm install -g firebase-tools
   ```

2. **Log in:**
   ```
   firebase login
   ```
   This opens a browser window — sign in with the Google account that owns
   your Firebase project.

3. **Set your project ID** in `.firebaserc`:
   Open `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual
   project ID. You can find it in the Firebase console URL:
   `https://console.firebase.google.com/project/YOUR-PROJECT-ID/...`

4. **Add your domain to Google Calendar OAuth** (if using Calendar):
   In Google Cloud Console → Credentials → your OAuth Client ID, add:
   ```
   https://YOUR-PROJECT-ID.web.app
   ```
   to "Authorized JavaScript origins".

## Deploy

From inside the `TaskScheduler` folder:

```
firebase deploy --only hosting
```

Firebase prints your live URL when done:
```
✔  Deploy complete!
Hosting URL: https://YOUR-PROJECT-ID.web.app
```

Open that URL on your phone. To add it to your home screen:
- **iPhone (Safari):** tap Share → "Add to Home Screen"
- **Android (Chrome):** tap the three-dot menu → "Add to Home screen"

It will behave like an app icon on your home screen.

## Re-deploying after changes

Every time you update the code:
```
firebase deploy --only hosting
```

That's it — same command every time.
