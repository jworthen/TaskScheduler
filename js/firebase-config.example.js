/**
 * GOOGLE CALENDAR API SETUP
 * =========================
 * This app no longer uses Firebase — task data comes from Trello.
 * The only credential stored here is the Google Calendar OAuth client ID,
 * which is optional (used to avoid scheduling during busy blocks).
 *
 * Setup steps:
 * 1. Go to https://console.cloud.google.com/ and open a project.
 * 2. Navigate to "APIs & Services → Library" and enable the Google Calendar API.
 * 3. Go to "APIs & Services → OAuth consent screen".
 *    - Choose "External", fill in app name / email, save.
 *    - Add scope: https://www.googleapis.com/auth/calendar.readonly
 *    - Add your email as a test user.
 * 4. Go to "APIs & Services → Credentials → Create Credentials → OAuth client ID".
 *    - Application type: Web application
 *    - Authorized JavaScript origins: http://localhost:PORT (e.g. http://localhost:5500)
 *    - Copy the Client ID into GOOGLE_CALENDAR_CLIENT_ID below.
 *
 * SETUP STEPS
 * ===========
 * Copy this file to firebase-config.js and fill in your values:
 *   cp js/firebase-config.example.js js/firebase-config.js
 */

/** OAuth Client ID for Google Calendar (read-only, optional) */
export const GOOGLE_CALENDAR_CLIENT_ID = "YOUR_GOOGLE_CALENDAR_CLIENT_ID.apps.googleusercontent.com";
