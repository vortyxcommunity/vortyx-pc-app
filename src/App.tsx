import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import MainApp from "./pages/MainApp";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InvitePage from "./pages/InvitePage";
import NotFound from "./pages/NotFound";

import DesktopTitleBar from "@/components/desktop/DesktopTitleBar";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <div className="flex flex-col h-full w-full bg-[#0f0f0f] overflow-hidden">
            <DesktopTitleBar />
            <div className="flex-1 flex flex-col relative min-h-0 min-w-0 overflow-hidden">
              <Toaster />
              <Sonner />
              <HashRouter>
                <Routes>
                  <Route path="/" element={<MainApp />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/invite/:code" element={<InvitePage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </div>
          </div>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
