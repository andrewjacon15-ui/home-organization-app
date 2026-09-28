import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

// When served from Firebase Hosting, use the page's own host as the auth
// domain so sign-in redirects stay first-party (Safari/iOS PWAs need this).
const onFirebaseHosting = /\.(web\.app|firebaseapp\.com)$/.test(window.location.hostname)

// Web API keys are public identifiers, not secrets; access is enforced by
// security rules. See https://firebase.google.com/docs/projects/api-keys
export const firebaseConfig = {
  apiKey: 'AIzaSyByoQDWdqHASJYNWX5tVVL18bvq3gpck04',
  authDomain: onFirebaseHosting ? window.location.hostname : 'home-organization-app-dkcbl.firebaseapp.com',
  projectId: 'home-organization-app-dkcbl',
  storageBucket: 'home-organization-app-dkcbl.firebasestorage.app',
  messagingSenderId: '254203364485',
  appId: '1:254203364485:web:b928dc31d7e5b9cf5115ec',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Local cache keeps the wall display usable through Wi-Fi blips.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const functions = getFunctions(app, 'us-central1')

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** "Calendar connect" OAuth client (public ID). Its secret is only in Cloud Functions. */
export const GOOGLE_CALENDAR_CLIENT_ID = '254203364485-vj57g7ocoo1p7qen3nttc61vusrsg44c.apps.googleusercontent.com'
