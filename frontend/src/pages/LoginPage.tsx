import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, isLoading, loginWithGoogle, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmittingDemo, setIsSubmittingDemo] = useState(false);

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const handleDemoLogin = async () => {
    try {
      setIsSubmittingDemo(true);
      setError(null);
      await loginAsDemo();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Unable to sign in as Demo User. Please try again.');
    } finally {
      setIsSubmittingDemo(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">ReachInbox</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to manage your scheduled outreach.</p>
        
        <div className="mt-6 flex flex-col gap-3">
          <GoogleLogin
            onSuccess={async ({ credential }) => {
              if (!credential) return setError('Google did not return an ID token.');
              try {
                setError(null);
                await loginWithGoogle(credential);
                navigate('/dashboard', { replace: true });
              } catch {
                setError('Unable to verify Google token. Fallback to Demo Login below.');
              }
            }}
            onError={() => setError('Google sign-in was cancelled or failed.')}
          />

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">or</span></div>
          </div>

          <button
            type="button"
            onClick={() => void handleDemoLogin()}
            disabled={isSubmittingDemo}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmittingDemo ? 'Signing in...' : 'Sign in as Demo User (1-Click)'}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
