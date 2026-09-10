import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, isLoading, loginWithGoogle, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isDemoLoggingIn, setIsDemoLoggingIn] = useState(false);

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const handleDemoLogin = async () => {
    setIsDemoLoggingIn(true);
    setError(null);
    try {
      await loginAsDemo();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setIsDemoLoggingIn(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">ReachInbox</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to manage your scheduled outreach.</p>
        
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex justify-center w-full">
            <GoogleLogin
              onSuccess={async ({ credential }) => {
                if (!credential) return setError('Google did not return an ID token.');
                try {
                  setError(null);
                  await loginWithGoogle(credential);
                  navigate('/dashboard', { replace: true });
                } catch (err) {
                  console.error('Google login error:', err);
                  setError('Unable to sign in with Google. Please try again.');
                }
              }}
              onError={() => setError('Google sign-in popup was closed or failed.')}
            />
          </div>

          <div className="relative flex w-full items-center py-2">
            <div className="flex-grow border-t border-slate-200" />
            <span className="mx-3 flex-shrink text-xs uppercase tracking-wider text-slate-400">Or</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={() => void handleDemoLogin()}
            disabled={isDemoLoggingIn}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50"
          >
            {isDemoLoggingIn ? 'Signing in...' : '⚡ Continue with 1-Click Demo Account'}
          </button>
        </div>

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
