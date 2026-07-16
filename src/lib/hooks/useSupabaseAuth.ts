import { useEffect, useState } from 'react';
import { supabase, getCurrentUser, signUpUser, loginUser, logoutUser } from '../supabaseIntegration';

export function useSupabaseAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signup = async (email: string, password: string, userData: { firstName: string; lastName: string; phone?: string }) => {
    setLoading(true);
    setError(null);
    const result = await signUpUser(email, password, userData);
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
    return result;
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const result = await loginUser(email, password);
    if (result.success) {
      setUser(result.user);
    } else {
      setError(result.error);
    }
    setLoading(false);
    return result;
  };

  const logout = async () => {
    setLoading(true);
    await logoutUser();
    setUser(null);
    setLoading(false);
  };

  return {
    user,
    loading,
    error,
    signup,
    login,
    logout,
    isAuthenticated: !!user,
  };
}
