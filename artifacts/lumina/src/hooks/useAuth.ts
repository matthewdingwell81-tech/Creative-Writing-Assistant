import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  signOut,
  signInWithCredential,
  signInWithPopup,
  getRedirectResult
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import { auth, googleProvider, googleWebClientId } from "@/lib/firebase";
import { setCurrentTierUser } from "@/services/userTierService";
import { syncUserTier } from "@/lib/userTier";

let nativeGoogleSignInInitialization: Promise<void> | null = null;

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function initializeNativeGoogleSignIn(): Promise<void> {
  if (!nativeGoogleSignInInitialization) {
    const attempt = GoogleSignIn.initialize({ clientId: googleWebClientId });
    nativeGoogleSignInInitialization = attempt;
    try {
      await attempt;
    } catch (error) {
      if (nativeGoogleSignInInitialization === attempt) nativeGoogleSignInInitialization = null;
      throw error;
    }
    return;
  }

  await nativeGoogleSignInInitialization;
}

export interface AuthUser {
  id: string;
  email: string | null;
  username: string;
  createdAt: string;
  firebaseUid?: string | null;
  premium?: boolean | null;
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

const AuthContext = createContext<UseAuthResult | null>(null);

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.replace(/^auth\//, "") : null;
}

export function getGoogleSignInErrorMessage(error: unknown): string {
  switch (getFirebaseErrorCode(error)) {
    case "popup-blocked":
      return "Your browser blocked Google sign-in. Allow popups for this website, then try again (auth/popup-blocked).";
    case "popup-closed-by-user":
    case "cancelled-popup-request":
    case "redirect-cancelled-by-user":
      return "Google sign-in was cancelled. You can try again whenever you're ready.";
    case "network-request-failed":
      return "Google sign-in could not connect. Check your internet connection and try again.";
    case "unauthorized-domain":
      return "Google sign-in is not configured for this website (auth/unauthorized-domain).";
    case "operation-not-allowed":
      return "Google sign-in is not enabled for this app (auth/operation-not-allowed).";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Google sign-in failed. Please try again.";
  }
}

function toGoogleSignInError(error: unknown): Error {
  return new Error(getGoogleSignInErrorMessage(error));
}

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.json();
    return new Error(typeof body?.error === "string" ? body.error : fallback);
  } catch {
    return new Error(fallback);
  }
}

function toAuthUser(value: {
  id: string;
  username: string;
  email?: string | null;
  createdAt: string;
  firebaseUid?: string | null;
  premium?: boolean | null;
}): AuthUser {
  if (!Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error("Your account signup date is missing. Please try signing in again.");
  }
  return {
    id: value.id,
    username: value.username,
    email: value.email ?? null,
    createdAt: value.createdAt,
    firebaseUid: value.firebaseUid ?? null,
    premium: value.premium ?? null,
  };
}

async function fetchServerSession(firebaseUser: import("firebase/auth").User | null): Promise<AuthUser | null> {
  // An unrelated, unverified Firebase login must not break a valid password
  // session. It cannot authorize Firebase restoration under the server policy.
  const idToken = firebaseUser && firebaseUser.emailVerified !== false ? await firebaseUser.getIdToken() : null;
  const response = await fetch("/api/auth/me", {
    credentials: "include",
    ...(idToken ? { headers: {
      Authorization: `Bearer ${idToken}`,
      "X-Lumina-Preserve-Password-Session": "true",
    } } : {}),
  });
  if (response.status === 401) {
    if (firebaseUser?.emailVerified === false) {
      throw new Error("Your Firebase email is not verified. Verify your email or sign in with Google, then try again.");
    }
    return null;
  }
  if (!response.ok) {
    throw await parseApiError(response, "Could not check your session.");
  }
  return toAuthUser(await response.json());
}

async function exchangeFirebaseSession(
  firebaseUser: import("firebase/auth").User,
): Promise<AuthUser> {
  const idToken = await firebaseUser.getIdToken();
  const response = await fetch("/api/auth/firebase-session", {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    throw await parseApiError(response, "Google sign-in could not start a Lumina session.");
  }
  return toAuthUser(await response.json());
}

function useAuthState(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleError, setGoogleError] = useState<Error | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initializeSession() {
      try {
        await auth.authStateReady();
        let redirectUser: import("firebase/auth").User | null = null;
        let redirectError: unknown = null;
        if (!isNativeAndroid()) {
          try {
            redirectUser = (await getRedirectResult(auth))?.user ?? null;
          } catch (error) {
            redirectError = error;
          }
        }

        if (redirectUser) {
          // An explicit Google account switch must finish the verified server
          // exchange; never fall back to a different account's cookie session.
          const restored = await exchangeFirebaseSession(redirectUser);
          if (mounted) {
            setGoogleError(null);
            setUser(restored);
          }
          return;
        }

        const firebaseUser = auth.currentUser;
        let restored: AuthUser | null = null;
        let recoveryError: unknown = redirectError;
        try {
          restored = await fetchServerSession(firebaseUser);
        } catch (error) {
          recoveryError ??= error;
        }

        // Firebase's persisted web identity can be stale or temporarily
        // unavailable. Retry with the server cookie alone so an unrelated,
        // valid username/password session is not discarded.
        if (!restored && firebaseUser) {
          try {
            restored = await fetchServerSession(null);
          } catch (error) {
            recoveryError ??= error;
          }
          if (!restored && !recoveryError) {
            recoveryError = new Error(
              "Google sign-in could not be verified. Try again or sign in with your username and password.",
            );
          }
        }

        if (!restored && recoveryError) throw recoveryError;
        if (mounted) {
          setUser(restored);
          if (restored) setGoogleError(null);
        }
      } catch (error) {
        if (mounted) {
          setUser(null);
          setGoogleError(toGoogleSignInError(error));
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    function handleSessionExpired() {
      if (mounted) {
        setUser(null);
      }
    }

    void initializeSession();
    window.addEventListener("lumina:session-expired", handleSessionExpired);

    return () => {
      mounted = false;
      window.removeEventListener("lumina:session-expired", handleSessionExpired);
    };
  }, []);

  const login = async (data: { username: string; password: string; rememberMe?: boolean }) => {
    setIsLoggingIn(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw await parseApiError(response, "Sign in failed.");
      }
      setUser(toAuthUser(await response.json()));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const register = async (data: { username: string; password: string }) => {
    setIsRegistering(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw await parseApiError(response, "Account creation failed.");
      }
      setUser(toAuthUser(await response.json()));
    } finally {
      setIsRegistering(false);
    }
  };

  const loginWithGoogle = async () => {
    setGoogleError(null);
    try {
      if (!isNativeAndroid()) {
        // Popup auth avoids the cross-origin redirect storage dependency on
        // firebaseapp.com. Keep this directly inside the user's click gesture.
        googleProvider.setCustomParameters({ prompt: "select_account" });
        const firebaseResult = await signInWithPopup(auth, googleProvider);
        setUser(await exchangeFirebaseSession(firebaseResult.user));
        return;
      }

      await initializeNativeGoogleSignIn();
      const googleResult = await GoogleSignIn.signIn();
      if (!googleResult.idToken) {
        throw new Error("Google sign-in did not return an identity token. Please try again.");
      }

      const credential = GoogleAuthProvider.credential(googleResult.idToken);
      const firebaseResult = await signInWithCredential(auth, credential);
      setUser(await exchangeFirebaseSession(firebaseResult.user));
    } catch (error) {
      const googleSignInError = toGoogleSignInError(error);
      setGoogleError(googleSignInError);
      throw googleSignInError;
    }
  };

  const logout = async () => {
    if (isNativeAndroid()) {
      await initializeNativeGoogleSignIn();
      await GoogleSignIn.signOut();
    }

    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      throw await parseApiError(response, "Sign out failed.");
    }
    await signOut(auth);
    setUser(null);
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
    isLoggingIn,
    isRegistering
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authState = useAuthState();
  setCurrentTierUser(
    authState.user
      ? { id: authState.user.id, createdAt: authState.user.createdAt, email: authState.user.email, username: authState.user.username }
      : null,
  );
  useEffect(() => syncUserTier(authState.user), [authState.user?.id, authState.user?.email, authState.user?.username]);
  return createElement(AuthContext.Provider, { value: authState }, children);
}

export function useAuth(): UseAuthResult {
  const authState = useContext(AuthContext);
  if (!authState) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return authState;
}
