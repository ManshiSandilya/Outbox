import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, isLoading, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><h1 className="text-2xl font-bold text-slate-900">ReachInbox</h1><p className="mt-2 text-sm text-slate-600">Sign in to manage your scheduled outreach.</p><div className="mt-6"><GoogleLogin onSuccess={async ({ credential }) => { if (!credential) return setError('Google did not return an ID token.'); try { setError(null); await loginWithGoogle(credential); navigate('/dashboard', { replace: true }); } catch { setError('Unable to sign in. Please try again.'); } }} onError={() => setError('Google sign-in was cancelled or failed.')} /></div>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}</section></main>;
}
