import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consumeSessionExpired } from "@/lib/sessionState";

export default function AuthPage() {
  // Consume the flag once at mount — clears it immediately so back-navigation
  // or re-renders never show a stale banner.
  const [sessionExpired] = useState(() => consumeSessionExpired());
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login, register, isLoggingIn, isRegistering } = useAuth();

  const isLoading = isLoggingIn || isRegistering;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      if (mode === "login") {
        await login({ username: username.trim(), password, rememberMe });
      } else {
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        await register({ username: username.trim(), password });
      }
    } catch (err: any) {
      const msg = err?.message || "Something went wrong. Please try again.";
      try {
        const parsed = JSON.parse(msg);
        setError(parsed.error || msg);
      } catch {
        setError(msg);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Lumina</h1>
          <p className="text-slate-400 text-sm">Your AI-powered writing companion</p>
        </div>

        {sessionExpired && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-300 text-sm text-center">
            Your session expired — please sign in again.
          </div>
        )}

        <div className="bg-[#16213e] rounded-2xl p-8 shadow-2xl border border-slate-700/50">
          <div className="flex rounded-lg bg-slate-800/50 p-1 mb-6">
            <button
              data-testid="tab-login"
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === "login"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              data-testid="tab-register"
              onClick={() => { setMode("register"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === "register"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-slate-300 text-sm mb-1.5 block">
                Username
              </Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-300 text-sm mb-1.5 block">
                Password
              </Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            {mode === "login" && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="checkbox-remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                />
                <span className="text-slate-400 text-sm">Remember me for 30 days</span>
              </label>
            )}

            {error && (
              <p data-testid="text-auth-error" className="text-red-400 text-sm bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              data-testid="button-submit-auth"
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 mt-2"
            >
              {isLoading
                ? mode === "login" ? "Signing in..." : "Creating account..."
                : mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-slate-500 text-xs mt-6">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              data-testid={mode === "login" ? "link-go-register" : "link-go-login"}
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
