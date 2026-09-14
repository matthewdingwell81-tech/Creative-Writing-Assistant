import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  signOut,
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
}): AuthUser {
  return {
    id: value.id,
    username: value.username,
    email: value.email ?? null,
  };
}

async function fetchServerSession(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (response.status === 401) return null;
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
        const redirectResult = await getRedirectResult(auth);
        const existingSession = await fetchServerSession();

        if (!mounted) return;
        if (existingSession) {
          setUser(existingSession);
        } else if (redirectResult?.user) {
          setUser(await exchangeFirebaseSession(redirectResult.user));
        } else {
          setUser(null);
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
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      const googleSignInError = toGoogleSignInError(error);
      setGoogleError(googleSignInError);
      throw googleSignInError;
    }
  };

  const logout = async () => {
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
  return createElement(AuthContext.Provider, { value: authState }, children);
}

export function useAuth(): UseAuthResult {
  const authState = useContext(AuthContext);
  if (!authState) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return authState;
}
