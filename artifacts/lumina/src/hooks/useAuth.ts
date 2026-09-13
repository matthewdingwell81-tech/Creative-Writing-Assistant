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
  username: string;
}

export interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
  login: (data: { username: string; password: string; rememberMe?: boolean }) => Promise<void>;
  register: (data: { username: string; password: string }) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  googleError: Error | null;
  logout: () => Promise<void>;
  loginError: null;
  registerError: null;
  isLoggingIn: boolean;
  isRegistering: boolean;
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.replace(/^auth\//, "") : null;
}

export function getGoogleSignInErrorMessage(error: unknown): string {
  switch (getFirebaseErrorCode(error)) {
    case "popup-closed-by-user":
    case "cancelled-popup-request":
    case "redirect-cancelled-by-user":
      return "Google sign-in was cancelled. You can try again whenever you're ready.";
    case "network-request-failed":
      return "Google sign-in could not connect. Check your internet connection and try again.";
    case "unauthorized-domain":
      return "Google sign-in is not configured for this app. Please contact support.";
    case "operation-not-allowed":
      return "Google sign-in is not enabled for this app. Please contact support.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Google sign-in failed. Please try again.";
  }
}

function toGoogleSignInError(error: unknown): Error {
  return new Error(getGoogleSignInErrorMessage(error));
}

export function useAuth(): UseAuthResult {
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
        setGoogleError(toGoogleSignInError(error));
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: firebaseUser.displayName ?? firebaseUser.email ?? "User"
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
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      const googleSignInError = toGoogleSignInError(error);
      setGoogleError(googleSignInError);
      throw googleSignInError;
    }
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
