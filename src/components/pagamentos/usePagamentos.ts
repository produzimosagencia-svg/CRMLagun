import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Dados da aba Pagamentos (/interno/pagamentos).
 *
 * Favorecido = quem recebe (chave Pix). Pagamento = um Pix a fazer para um
 * favorecido. O envio é feito pela função pagamentos-pix, que fala com o
 * banco; o painel só lança, cancela e manda pagar.
 */

export type Categoria = 'artista' | 'fornecedor' | 'staff' | 'outro';
export type TipoChave = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
export type Status = 'a_pagar' | 'processando' | 'pago' | 'falhou' | 'cancelado';

export interface Favorecido {
  id: string; nome: string; documento: string | null; tipo_chave: TipoChave; chave_pix: string;
  categoria: Categoria; observacao: string | null; ativo: boolean;
}

export interface Pagamento {
  id: string; favorecido_id: string; event_id: string | null; descricao: string; valor: number;
  vencimento: string | null; status: Status; chave_pix_usada: string | null; nome_no_banco: string | null;
  end_to_end_id: string | null; erro: string | null; criado_por: string | null; pago_por: string | null;
  pago_em: string | null; created_at: string;
  favorecido?: Pick<Favorecido, 'id' | 'nome' | 'chave_pix' | 'tipo_chave' | 'categoria'> | null;
  evento?: { id: string; nome: string; data: string | null } | null;
}

export interface LogItem { id: number; acao: string; detalhe: unknown; user_id: string | null; created_at: string }

export const CATEGORIAS: Record<Categoria, string> = { artista: 'Artista', fornecedor: 'Fornecedor', staff: 'Staff', outro: 'Outro' };
export const TIPOS_CHAVE: Record<TipoChave, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' };
export const STATUS: Record<Status, { rotulo: string; cor: string }> = {
  a_pagar: { rotulo: 'A pagar', cor: '#D9B14E' },
  processando: { rotulo: 'Processando', cor: '#60A5FA' },
  pago: { rotulo: 'Pago', cor: '#34D399' },
  falhou: { rotulo: 'Falhou', cor: '#F87171' },
  cancelado: { rotulo: 'Cancelado', cor: '#9CA3AF' },
};

export const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtData = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '');
export const fmtDataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// ── Chave Pix: descobre o tipo e valida o formato ───────────────────────────
const digitos = (s: string) => s.replace(/\D/g, '');

function cpfValido(c: string) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return (r === 10 ? 0 : r) === Number(c[n]); };
  return dv(9) && dv(10);
}
function cnpjValido(c: string) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * p[i]; const r = s % 11; return (r < 2 ? 0 : 11 - r) === Number(c[n]); };
  return dv(12) && dv(13);
}

/** Devolve a chave normalizada do jeito que o banco espera, ou um erro. */
export function normalizarChave(entrada: string): { tipo: TipoChave; chave: string } | { erro: string } {
  const s = entrada.trim();
  if (!s) return { erro: 'Informe a chave Pix' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { tipo: 'aleatoria', chave: s.toLowerCase() };
  if (s.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { erro: 'E-mail inválido' };
    return { tipo: 'email', chave: s.toLowerCase() };
  }
  const d = digitos(s);
  if (d.length === 11 && cpfValido(d)) return { tipo: 'cpf', chave: d };
  if (d.length === 14 && cnpjValido(d)) return { tipo: 'cnpj', chave: d };
  if (s.startsWith('+') || d.length === 10 || d.length === 11 || (d.length === 13 && d.startsWith('55'))) {
    const n = d.length === 13 ? d : d.length === 12 ? d : `55${d}`;
    if (n.length < 12 || n.length > 13) return { erro: 'Telefone inválido: use DDD + número' };
    return { tipo: 'telefone', chave: `+${n}` };
  }
  return { erro: 'Não reconheci a chave: use CPF, CNPJ, e-mail, telefone ou chave aleatória' };
}

export function chaveBonita(f: Pick<Favorecido, 'tipo_chave' | 'chave_pix'>) {
  const c = f.chave_pix;
  if (f.tipo_chave === 'cpf') return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (f.tipo_chave === 'cnpj') return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (f.tipo_chave === 'telefone') { const d = digitos(c).replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : c; }
  return c;
}

// ── Hooks ──────────────────────────────────────────────────────────────────
export function useFavorecidos() {
  const [favorecidos, setFavorecidos] = useState<Favorecido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await (supabase as any).from('lagun_favorecidos').select('*').order('nome');
      if (!vivo) return;
      if (error) console.error('[Pagamentos] favorecidos', error);
      setFavorecidos((data || []) as Favorecido[]);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [versao]);
  return { favorecidos, carregando, recarregar };
}

export function usePagamentos(filtro: 'abertos' | 'historico') {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      let q = (supabase as any).from('lagun_pagamentos')
        .select('*, favorecido:lagun_favorecidos(id, nome, chave_pix, tipo_chave, categoria), evento:lagun_events(id, nome, data)');
      q = filtro === 'abertos'
        ? q.in('status', ['a_pagar', 'processando']).order('vencimento', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
        : q.in('status', ['pago', 'falhou', 'cancelado']).order('pago_em', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(300);
      const { data, error } = await q;
      if (!vivo) return;
      if (error) console.error('[Pagamentos] lista', error);
      setPagamentos(((data || []) as any[]).map((p) => ({ ...p, valor: Number(p.valor) })) as Pagamento[]);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [filtro, versao]);
  return { pagamentos, carregando, recarregar };
}

export function useEventosRecentes() {
  const [eventos, setEventos] = useState<{ id: string; nome: string; data: string | null }[]>([]);
  useEffect(() => {
    const limite = new Date(); limite.setDate(limite.getDate() - 90);
    (supabase as any).from('lagun_events').select('id, nome, data').gte('data', limite.toISOString().slice(0, 10))
      .order('data', { ascending: false }).limit(60)
      .then(({ data }: { data: any[] | null }) => setEventos(data || []));
  }, []);
  return eventos;
}

export function useBanco() {
  const [banco, setBanco] = useState<{ configurado: boolean; banco: string; ambiente?: string } | null>(null);
  useEffect(() => {
    chamarFuncao({ action: 'banco' }).then((r) => setBanco(r.ok ? r.data : { configurado: false, banco: 'Banco Inter' }));
  }, []);
  return banco;
}

export function useLimiteDiario() {
  const [limite, setLimite] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    (supabase as any).from('lagun_pagamentos_config').select('limite_diario').eq('id', true).maybeSingle()
      .then(({ data }: { data: any }) => setLimite(data ? Number(data.limite_diario) : 0));
  }, [versao]);
  const salvar = async (valor: number) => {
    const { error } = await (supabase as any).from('lagun_pagamentos_config').update({ limite_diario: valor, updated_at: new Date().toISOString() }).eq('id', true);
    if (!error) setVersao((v) => v + 1);
    return error;
  };
  return { limite, salvar };
}

/** Chama a função pagamentos-pix com a sessão do usuário. */
export async function chamarFuncao(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pagamentos-pix`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
