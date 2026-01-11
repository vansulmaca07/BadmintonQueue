import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import QueuePage from './pages/QueuePage';
import PlayerStatsPage from './pages/PlayerStatsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboard from './pages/AdminDashboard';
import MasterPlayerPage from './pages/MasterPlayerPage';
import ExpensesPage from './pages/ExpensesPage';
import SessionHistoryPage from './pages/SessionHistoryPage';

// Protected Route for Admin only
function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏸</div>
          <div className="text-xl text-indigo-900 font-semibold">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<QueuePage />} />
      <Route path="/player/:playerName" element={<PlayerStatsPage />} />
      <Route path="/public/expenses" element={<ExpensesPage />} />
      <Route path="/public/history" element={<SessionHistoryPage />} />
      <Route path="/public/players" element={<MasterPlayerPage />} />
      
      {/* ADMIN ROUTES */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/players" element={<AdminRoute><MasterPlayerPage /></AdminRoute>} />
      <Route path="/admin/expenses" element={<AdminRoute><ExpensesPage /></AdminRoute>} />
      <Route path="/admin/history" element={<AdminRoute><SessionHistoryPage /></AdminRoute>} />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}

export default App;