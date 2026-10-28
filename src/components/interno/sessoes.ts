import { useCallback, useEffect, useState } from 'react';
import { BadgeDollarSign, Megaphone, Settings, Wallet, type LucideIcon } from 'lucide-react';

/**
 * Sessões do app de computador: o painel se divide em áreas separadas e a
 * pessoa escolhe uma depois da abertura. Cada sessão lista as chaves das
 * seções do menu (InternoLayout) que aparecem nela. Quem vê cada sessão segue
 * as permissões de hoje: a sessão só aparece se ao menos uma das suas seções
 * está liberada para a pessoa. No navegador nada disso vale.
 */
export type SessaoId = 'marketing' | 'vendedores' | 'financeiro' | 'admin';

export interface Sessao {
  id: SessaoId;
  nome: string;
  descricao: string;
  icone: LucideIcon;
  chaves: string[];
}

export const SESSOES: Sessao[] = [
  {
    id: 'marketing',
    nome: 'Marketing',
    descricao: 'Redes sociais, WhatsApp, campanhas e landing page.',
    icone: Megaphone,
    chaves: ['dashboard', 'referencias', 'landing', 'chat', 'social_media', 'comentarios', 'automacoes', 'whatsapp', 'ads', 'blueticket', 'prive', 'zig_tickets'],
  },
  {
    id: 'vendedores',
    nome: 'Vendedores',
    descricao: 'CRM, clientes e desempenho da equipe de vendas.',
    icone: BadgeDollarSign,
    chaves: ['vendedores', 'crm', 'visao_geral'],   // a sessão abre em Vendedores
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Pagamentos a fazer, histórico e favorecidos.',
    icone: Wallet,
    chaves: ['pagamentos'],
  },
  {
    id: 'admin',
    nome: 'Admin',
    descricao: 'Usuários, permissões e configurações do sistema.',
    icone: Settings,
    chaves: ['admin'],
  },
];

/** Seções que aparecem em todas as sessões. */
export const CHAVES_COMUNS = new Set(['tarefas', 'calendario', 'perfil']);

/** O preload do app de computador expõe window.app. */
export function noAppDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { app?: { noLauncher?: boolean } }).app?.noLauncher);
}

const CHAVE = 'interno-sessao';

/** Ao sair da conta (ou entrar de novo) a escolha volta a aparecer. */
export function esquecerSessao() {
  try { sessionStorage.removeItem(CHAVE); } catch { /* ignora */ }
}
const EVENTO = 'interno-sessao-mudou';

/**
 * Sessão escolhida, guardada só enquanto o app está aberto (sessionStorage):
 * toda vez que o app abre, a escolha aparece de novo.
 */
export function useSessao(): [SessaoId | null, (id: SessaoId | null) => void] {
  const ler = () => {
    try { return (sessionStorage.getItem(CHAVE) as SessaoId | null) || null; } catch { return null; }
  };
  const [sessao, setSessaoLocal] = useState<SessaoId | null>(ler);

  useEffect(() => {
    const ouvir = () => setSessaoLocal(ler());
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);

  const setSessao = useCallback((id: SessaoId | null) => {
    try {
      if (id) sessionStorage.setItem(CHAVE, id);
      else sessionStorage.removeItem(CHAVE);
    } catch { /* sem storage: vale só na memória */ }
    setSessaoLocal(id);
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return [sessao, setSessao];
}
