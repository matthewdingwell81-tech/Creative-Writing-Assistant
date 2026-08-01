import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AuthPage from "@/pages/AuthPage";
import { useAuth } from "@/hooks/useAuth";

function SessionExpiredHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    function handleExpired() {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      setLocation("/auth?expired=1", { replace: true });
    }

    window.addEventListener("lumina:session-expired", handleExpired);
    return () => window.removeEventListener("lumina:session-expired", handleExpired);
  }, [setLocation]);

  return null;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth">
        {user ? <Redirect to="/" /> : <AuthPage />}
      </Route>
      <Route path="/">
        {user ? <Home /> : <Redirect to="/auth" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SessionExpiredHandler />
          <Toaster />
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
