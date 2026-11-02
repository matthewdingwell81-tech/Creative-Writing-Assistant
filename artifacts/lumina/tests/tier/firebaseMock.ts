import { vi } from "vitest";

// SDK and app bootstrap are both replaced before any application import.
// Listeners can intentionally deliver callbacks after disposal to model races.
const firebase = vi.hoisted(() => {
  const auth = { currentUser: null as any, authStateReady: vi.fn() };
  return {
    auth,
    firestore: {},
    authListeners: [] as any[],
    documentListeners: [] as any[],
    onAuthStateChanged: vi.fn(),
    onSnapshot: vi.fn(),
    doc: vi.fn(),
    runTransaction: vi.fn(),
    setDoc: vi.fn(),
    transactionGet: vi.fn(),
    transactionSet: vi.fn(),
    getRedirectResult: vi.fn(),
    googleCredential: vi.fn(),
    signInWithCredential: vi.fn(),
    signOut: vi.fn(),
    signInWithRedirect: vi.fn(),
  };
});
const nativeGoogleSignIn = vi.hoisted(() => ({
  platform: "web",
  initialize: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
export { firebase, nativeGoogleSignIn };

vi.mock("@/lib/firebase", () => ({
  auth: firebase.auth,
  firestore: firebase.firestore,
  googleProvider: {},
  googleWebClientId: "test-google-web-client-id",
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativeGoogleSignIn.platform === "android",
    getPlatform: () => nativeGoogleSignIn.platform,
  },
}));
vi.mock("@capawesome/capacitor-google-sign-in", () => ({
  GoogleSignIn: {
    initialize: nativeGoogleSignIn.initialize,
    signIn: nativeGoogleSignIn.signIn,
    signOut: nativeGoogleSignIn.signOut,
  },
}));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credential: firebase.googleCredential },
  onAuthStateChanged: firebase.onAuthStateChanged,
  getRedirectResult: firebase.getRedirectResult,
  signInWithCredential: firebase.signInWithCredential,
  signOut: firebase.signOut,
  signInWithRedirect: firebase.signInWithRedirect,
}));
vi.mock("firebase/firestore", () => ({
  doc: firebase.doc,
  onSnapshot: firebase.onSnapshot,
  runTransaction: firebase.runTransaction,
  setDoc: firebase.setDoc,
  serverTimestamp: () => "mock-server-timestamp",
}));

export function snapshot(data?: Record<string, unknown>, metadata = {}) {
  return {
    data: () => data,
    exists: () => data !== undefined,
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
  };
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function googleUser(uid = "firebase-a", email = "a@example.test") {
  return { uid, email, getIdToken: vi.fn().mockResolvedValue("mock-id-token") };
}

export function resetFirebase() {
  vi.resetAllMocks();
  firebase.auth.currentUser = null;
  firebase.auth.authStateReady.mockResolvedValue(undefined);
  firebase.authListeners.length = 0;
  firebase.documentListeners.length = 0;
  firebase.onAuthStateChanged.mockImplementation((_auth, next, error) => {
    const stop = vi.fn();
    firebase.authListeners.push({ next, error, stop });
    return stop;
  });
  firebase.doc.mockImplementation((_db, collection, uid) => ({ path: `${collection}/${uid}` }));
  firebase.onSnapshot.mockImplementation((ref, options, next, error) => {
    const stop = vi.fn();
    firebase.documentListeners.push({ ref, options, next, error, stop });
    return stop;
  });
  firebase.transactionGet.mockResolvedValue(snapshot());
  firebase.runTransaction.mockImplementation(async (_db, update) => update({
    get: firebase.transactionGet, set: firebase.transactionSet,
  }));
  firebase.setDoc.mockResolvedValue(undefined);
  firebase.getRedirectResult.mockResolvedValue(null);
  firebase.googleCredential.mockImplementation(idToken => ({ idToken }));
  firebase.signInWithCredential.mockImplementation(async () => {
    const user = googleUser();
    firebase.auth.currentUser = user;
    return { user };
  });
  firebase.signOut.mockImplementation(async () => { firebase.auth.currentUser = null; });
  nativeGoogleSignIn.platform = "web";
  nativeGoogleSignIn.initialize.mockResolvedValue(undefined);
  nativeGoogleSignIn.signIn.mockResolvedValue({ idToken: "mock-google-provider-id-token" });
  nativeGoogleSignIn.signOut.mockResolvedValue(undefined);
  window.localStorage.clear();
}

export function emitAuth(user: ReturnType<typeof googleUser> | null, listener = firebase.authListeners.at(-1)) {
  firebase.auth.currentUser = user;
  listener.next(user);
}

export async function flushTransactions() {
  // Includes the transaction get, completion, catch, and finally microtasks.
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
