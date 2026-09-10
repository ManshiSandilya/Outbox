import { Navigate } from 'react-router-dom';
import { type ReactNode } from 'react';

import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-slate-600">Loading your session…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
