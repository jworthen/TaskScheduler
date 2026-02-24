/**
 * FIREBASE SETUP INSTRUCTIONS
 * ===========================
 * 1. Go to https://console.firebase.google.com/ and sign in.
 * 2. Click "Add project" (or open an existing one).
 * 3. In the project dashboard, click the "</>" (Web) icon to register a web app.
 * 4. Copy the firebaseConfig values shown and paste them below.
 * 5. In the left sidebar go to "Build → Firestore Database".
 *    - Click "Create database"
 *    - Choose "Start in production mode" or "test mode" (test mode is fine for personal use)
 *    - Select a region close to you
 * 6. Update Firestore Security Rules to allow single-user access:
 *      rules_version = '2';
 *      service cloud.firestore {
 *        match /databases/{database}/documents {
 *          match /{document=**} {
 *            allow read, write: if true;   // OK for single-user local/personal use
 *          }
 *        }
 *      }
 *
 * GOOGLE CALENDAR API SETUP
 * =========================
 * 1. Go to https://console.cloud.google.com/ and open the same project.
 * 2. Navigate to "APIs & Services → Library".
 * 3. Search for "Google Calendar API" and enable it.
 * 4. Go to "APIs & Services → OAuth consent screen".
 *    - Choose "External", fill in app name / email, save.
 *    - Add scope: https://www.googleapis.com/auth/calendar.readonly
 *    - Add your email as a test user.
 * 5. Go to "APIs & Services → Credentials → Create Credentials → OAuth client ID".
 *    - Application type: Web application
 *    - Authorized JavaScript origins: http://localhost:PORT (e.g. http://localhost:5500)
 *      (add your real domain here when deployed)
 *    - Copy the Client ID into GOOGLE_CALENDAR_CLIENT_ID below.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyCxshdeSMZGd4aGAEkpcEtm3iRzOIaAZuw",
  authDomain: "taskscheduler-7456c.firebaseapp.com",
  projectId: "taskscheduler-7456c",
  storageBucket: "taskscheduler-7456c.firebasestorage.app",
  messagingSenderId: "990441124707",
  appId: "1:990441124707:web:eb0a98a10a4f0bb04e5956",
  measurementId: "G-HBLB73Y5WB"
};

/** OAuth Client ID for Google Calendar (read-only) */
export const GOOGLE_CALENDAR_CLIENT_ID = "YOUR_CALENDAR_OAUTH_CLIENT_ID.apps.googleusercontent.com";

/** Set to true once you have filled in the values above */
export const FIREBASE_CONFIGURED = false;
