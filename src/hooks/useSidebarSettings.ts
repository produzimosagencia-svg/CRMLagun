import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SidebarKey =
  | 'dashboard' | 'landing' | 'crm' | 'blueticket' | 'prive' | 'zig_tickets'
  | 'base' | 'tarefas' | 'calendario' | 'chat' | 'whatsapp' | 'ads'
  | 'mailchimp' | 'design' | 'orcamento_site';

interface SidebarState {
  global: Record<string, boolean>;
  personal: Record<string, boolean>;
}

let cache: SidebarState | null = null;
const subscribers = new Set<(state: SidebarState) => void>();

async function fetchSettings() {
  const { data: globalData } = await supabase.from('sidebar_menu_settings').select('key, enabled');
  const global: Record<string, boolean> = {};
  (globalData || []).forEach((row) => { global[row.key] = row.enabled; });

  // Overrides individuais do usuário logado (Admin > Usuários > acessos do menu)
  const personal: Record<string, boolean> = {};
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: overrides } = await supabase
      .from('user_menu_overrides')
      .select('key, enabled')
      .eq('user_id', auth.user.id);
    (overrides || []).forEach((row) => { personal[row.key] = row.enabled; });
  }

  cache = { global, personal };
  subscribers.forEach((cb) => cb(cache!));
  return cache;
}

export function useSidebarSettings() {
  const [state, setState] = useState<SidebarState>(cache || { global: {}, personal: {} });

  useEffect(() => {
    subscribers.add(setState);
    if (!cache) fetchSettings();
    return () => { subscribers.delete(setState); };
  }, []);

  // Visibilidade no sidebar: precisa estar habilitado globalmente E para o usuário
  const isEnabled = (key: SidebarKey) =>
    state.global[key] !== false && state.personal[key] !== false;

  // Somente a config global (usado na aba Admin > Configurações)
  const isGlobalEnabled = (key: SidebarKey) => state.global[key] !== false;

  return { isEnabled, isGlobalEnabled, refetch: fetchSettings };
}
