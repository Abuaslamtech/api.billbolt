// firebase-admin.ts
import * as admin from 'firebase-admin';

// Option 1: Using service account key file path (Recommended)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./src/firebase/serviceAccountKey.json'), // Adjust path as needed
  });
}

export { admin };