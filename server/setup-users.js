const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function setupUsers() {
  try {
    // Get the users from Firebase Auth
    const authUsers = await admin.auth().listUsers();
    
    for (const user of authUsers.users) {
      // Create user document in Firestore
      await db.collection('users').doc(user.uid).set({
        email: user.email,
        username: user.email.split('@')[0], // Extract username from email
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Created document for user: ${user.email}`);
    }
    
    console.log('All users have been set up successfully!');
  } catch (error) {
    console.error('Error setting up users:', error);
  } finally {
    process.exit();
  }
}

setupUsers(); 