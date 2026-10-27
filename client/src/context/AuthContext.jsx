import { createContext, useCallback, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../services/auth.js';

const AuthContext = createContext(null);
const ME_KEY = ['auth', 'me'];

const fetchMe = async () => {
  try {
    return await authApi.getMe();
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
};

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: user = null, isLoading, refetch } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: Infinity,
  });

  const login = useCallback(
    async (credentials) => {
      const next = await authApi.login(credentials);
      queryClient.setQueryData(ME_KEY, next);
      return next;
    },
    [queryClient],
  );

  const register = useCallback(
    async (payload) => {
      const next = await authApi.register(payload);
      queryClient.setQueryData(ME_KEY, next);
      return next;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Leave for the landing page before the session clears, so route guards don't bounce to /login.
      navigate('/', { replace: true });
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    }
  }, [queryClient, navigate]);

  // For sign-in methods that finish elsewhere (Google, emailed code, password change).
  const setUser = useCallback((next) => queryClient.setQueryData(ME_KEY, next), [queryClient]);

  const refresh = useCallback(async () => (await refetch()).data ?? null, [refetch]);

  const value = useMemo(
    () => ({ user, loading: isLoading, login, register, logout, refresh, setUser }),
    [user, isLoading, login, register, logout, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
