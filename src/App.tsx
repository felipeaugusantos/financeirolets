import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import { RoleRoute } from "@/components/RoleRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createQueryClient } from "@/lib/queryClient";
import { KaikinProvider } from "@/components/kaikin/KaikinProvider";
import { KaikinFab } from "@/components/kaikin/KaikinFab";
import { KaikinSheet } from "@/components/kaikin/KaikinSheet";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const AccountingTransactions = lazy(() => import("./pages/AccountingTransactions"));
const Crm = lazy(() => import("./pages/Crm"));
const Helpdesk = lazy(() => import("./pages/Helpdesk"));
const Accounts = lazy(() => import("./pages/Accounts"));
const FiscalInvoices = lazy(() => import("./pages/FiscalInvoices"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const BankRegistration = lazy(() => import("./pages/BankRegistration"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const ReconciliationRules = lazy(() => import("./pages/ReconciliationRules"));
const CardReconciliation = lazy(() => import("./pages/CardReconciliation"));

const Ifood = lazy(() => import("./pages/Ifood"));
const Factory = lazy(() => import("./pages/Factory"));
const Releases = lazy(() => import("./pages/Releases"));
import NotFound from "./pages/NotFound";

const queryClient = createQueryClient();

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <img src="/logo-circle.jpg" alt="Carregando" className="h-12 w-12 rounded-full animate-pulse" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <RoleRoute>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Carregando…</p>}>{children}</Suspense>
        </ErrorBoundary>
      </RoleRoute>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <KaikinProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/lancamentos" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
              <Route path="/lancamentos-contabeis" element={<ProtectedRoute><AccountingTransactions /></ProtectedRoute>} />
              <Route path="/chamados" element={<ProtectedRoute><Helpdesk /></ProtectedRoute>} />
              <Route path="/crm" element={<Navigate to="/crm/agenda" replace />} />
              <Route path="/crm/agenda" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/buscar" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/empresas" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/empresas/:companyId" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/funil" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/pedidos" element={<Navigate to="/fabrica/pedidos" replace />} />
              <Route path="/crm/clientes" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/produtos" element={<Navigate to="/fabrica/produtos" replace />} />
              <Route path="/contas" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
              <Route path="/gestao/pagar" element={<Navigate to="/contas?tab=pagar" replace />} />
              <Route path="/gestao/receber" element={<Navigate to="/contas?tab=receber" replace />} />
              <Route path="/gestao/notas" element={<ProtectedRoute><FiscalInvoices /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/conciliacao" element={<Navigate to="/conciliacao/conciliar" replace />} />
              <Route path="/conciliacao/bancos" element={<ProtectedRoute><BankRegistration /></ProtectedRoute>} />
              <Route path="/conciliacao/conciliar" element={<ProtectedRoute><BankReconciliation /></ProtectedRoute>} />
              <Route path="/conciliacao/regras" element={<ProtectedRoute><ReconciliationRules /></ProtectedRoute>} />
              <Route path="/conciliacao/cartao" element={<ProtectedRoute><CardReconciliation /></ProtectedRoute>} />

              <Route path="/fabrica" element={<ProtectedRoute><Factory /></ProtectedRoute>} />
              <Route path="/fabrica/:tab" element={<ProtectedRoute><Factory /></ProtectedRoute>} />
              <Route path="/ifood" element={<ProtectedRoute><Ifood /></ProtectedRoute>} />
              <Route path="/novidades" element={<ProtectedRoute><Releases /></ProtectedRoute>} />
              <Route path="/auditoria" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <KaikinFab />
            <KaikinSheet />
          </KaikinProvider>
        </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
