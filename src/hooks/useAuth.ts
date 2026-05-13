import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'partner' | 'design' | 'trafego';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPartner, setIsPartner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    const loadRoles = async (currentUserId: string) => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUserId);

      if (error) {
        setLoading(false);
        return;
      }

      const userRoles = (data ?? []).map((r) => r.role as AppRole);
      setRoles(userRoles);
      setIsPartner(userRoles.length > 0);
      setIsAdmin(userRoles.includes('admin'));
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          void loadRoles(session.user.id);
        } else {
          setRoles([]);
          setIsPartner(false);
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        void loadRoles(session.user.id);
        return;
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInByUsername = async (username: string, password: string) => {
    // Look up email by username using security definer function
    const { data, error: lookupError } = await supabase.rpc('get_email_by_username', {
      _username: username,
    });

    if (lookupError) {
      return { error: { message: 'Erro de conexão. Tente novamente em instantes.' } };
    }
    if (!data) {
      return { error: { message: 'Usuário não encontrado' } };
    }

    const email = data as string;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, isPartner, isAdmin, roles, signIn, signInByUsername, signUp, signOut };
}
