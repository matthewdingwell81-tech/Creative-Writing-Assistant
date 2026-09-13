import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleError, setGoogleError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    // Redirect auth completes after the browser returns to the app. Reading
    // the result on startup is required for mobile browsers and Capacitor
    // WebViews, where popup auth is unreliable.
    getRedirectResult(auth).catch((error: unknown) => {
      if (mounted) {
        setGoogleError(error instanceof Error ? error : new Error("Google sign-in failed."));
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: firebaseUser.displayName ?? firebaseUser.email
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (data: { username: string; password: string; rememberMe?: boolean }) => {
    await signInWithEmailAndPassword(auth, data.username, data.password);
  };

  const register = async (data: { username: string; password: string }) => {
    await createUserWithEmailAndPassword(auth, data.username, data.password);
  };

  const loginWithGoogle = async () => {
    setGoogleError(null);
    await signInWithRedirect(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return {
    user,
    isLoading,
    login,
    register,
    loginWithGoogle,
    googleError,
    logout,
    loginError: null,
    registerError: null,
    isLoggingIn: false,
    isRegistering: false
  };
}
