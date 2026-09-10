import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { apiFetch, type AuthUser } from '../api';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void apiFetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { user: AuthUser };
        setUser(data.user);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await apiFetch('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) throw new Error('Google sign-in was not accepted by the server.');
    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

  const loginAsDemo = useCallback(async () => {
    const response = await apiFetch('/api/auth/dev-login', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Demo sign-in was not accepted by the server.');
    const data = (await response.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, loginWithGoogle, loginAsDemo, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
