import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface AuthUser {
  id: string;
  email: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (data: { username: string; password: string; rememberMe?: boolean }) => {
    // For email/password login, username field is actually the email
    await signInWithEmailAndPassword(auth, data.username, data.password);
  };

  const register = async (data: { username: string; password: string }) => {
    // For email/password registration, username field is actually the email
    await createUserWithEmailAndPassword(auth, data.username, data.password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return {
    user,
    isLoading,
    login,
    register,
    logout,
    loginError: null,
    registerError: null,
    isLoggingIn: false,
    isRegistering: false
  };
}
