import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function getFirebaseCredential(): admin.credential.Credential {
  // 1. Check if whole service account JSON is passed in env (e.g. on Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return admin.credential.cert(parsed);
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env variable:', e);
    }
  }

  // 2. Check if individual env variables are passed
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  // 3. Fallback to local file if it exists (for local development)
  const localPaths = [
    path.resolve(process.cwd(), 'src/firebase/serviceAccountKey.json'),
    path.resolve(process.cwd(), 'serviceAccountKey.json'),
    path.resolve(__dirname, 'serviceAccountKey.json'),
  ];

  for (const localPath of localPaths) {
    if (fs.existsSync(localPath)) {
      return admin.credential.cert(localPath);
    }
  }

  // 4. Default application credentials (Google Cloud environment)
  console.warn('⚠️ No explicit Firebase credentials found. Falling back to applicationDefault().');
  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getFirebaseCredential(),
  });
}

export { admin };