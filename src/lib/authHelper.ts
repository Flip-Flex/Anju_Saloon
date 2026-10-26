import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';

export interface CreateStaffAuthResult {
  success: boolean;
  uid?: string;
  email?: string;
  role?: string;
  error?: string;
}

/**
 * Creates a Firebase Auth user and associated Firestore 'users' profile
 * for a newly onboarded staff member using an isolated secondary app instance.
 * This guarantees the currently authenticated Admin session is NOT disrupted or logged out.
 */
export async function createStaffAuthAccount(
  email: string,
  password: string,
  role: 'Admin' | 'Cashier',
  staffId?: string
): Promise<CreateStaffAuthResult> {
  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  const secondaryAppName = `staffAuthProvision-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);

  try {
    const secondaryAuth = getAuth(secondaryApp);
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.trim().toLowerCase(), password);
    const uid = userCredential.user.uid;

    // Securely record user profile with role in Firestore 'users' collection
    await setDoc(doc(db, 'users', uid), {
      email: email.trim().toLowerCase(),
      role: role,
      staffId: staffId || null,
      createdAt: new Date().toISOString(),
      status: 'active'
    });

    await signOut(secondaryAuth);
    return { success: true, uid, email: email.trim().toLowerCase(), role };
  } catch (err: any) {
    console.error('Failed to create staff auth account:', err);
    let msg = 'Failed to create login account.';
    if (err.code === 'auth/email-already-in-use') {
      msg = 'An account with this email already exists in Firebase Auth.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Invalid email address format.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password is too weak. Please use at least 6 characters.';
    } else if (err.message) {
      msg = err.message;
    }
    return { success: false, error: msg };
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) {
      // Ignore cleanup error
    }
  }
}
