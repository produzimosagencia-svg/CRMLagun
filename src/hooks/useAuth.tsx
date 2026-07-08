import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'partner' | 'design' | 'trafego';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPartner: boolean;
  isAdmin: boolean;
  roles: AppRole[];
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInByUsername: (username: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider único de autenticação.
 *
 * Antes, `useAuth` era um hook que cada componente instanciava — cada instância
 * abria sua própria assinatura `onAuthStateChange` e refazia a query de roles.
 * Agora a lógica vive aqui uma única vez; todos os consumidores leem o mesmo
 * contexto (uma assinatura, uma carga de roles). Deve envolver a árvore inteira
 * no main.tsx, pois há consumidores fora do layout /interno (telas de login e a
 * rota /interno/trafego-gpt).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
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

  const value: AuthContextValue = {
    user, session, loading, isPartner, isAdmin, roles,
    signIn, signInByUsername, signUp, signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Consome o contexto de autenticação. Mesma API pública de antes. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  }
  return ctx;
}
