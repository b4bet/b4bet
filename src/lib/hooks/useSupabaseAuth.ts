import { useEffect, useState } from 'react';
import { supabase, getCurrentUser, signUpUser, loginUser, logoutUser } from '../supabaseIntegration';

type SupabaseUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function useSupabaseAuth() {
  const [user, setUser] = useState<SupabaseUser>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    void checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription?.unsubscribe();
  }, []);

  const signup = async (email: string, password: string, userData: { firstName: string; lastName: string; phone?: string }) => {
    setLoading(true);
    setError(null);
    const result = await signUpUser(email, password, userData);
    if (!result.success) setError(result.error ?? null);
    setLoading(false);
    return result;
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const result = await loginUser(email, password);
    if (result.success) setUser(result.user ?? null);
    else setError(result.error ?? null);
    setLoading(false);
    return result;
  };

  const logout = async () => {
    setLoading(true);
    await logoutUser();
    setUser(null);
    setLoading(false);
  };

  return { user, loading, error, signup, login, logout, isAuthenticated: !!user };
}
