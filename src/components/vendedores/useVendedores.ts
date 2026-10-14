import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Dados da área Vendedores (ranking, panorama, performance e metas).
 *
 * Vendedor é um cadastro à parte (lagun_vendedores). A venda dele soma as
 * compras feitas com um cupom seu (crm_purchases) e os lançamentos manuais
 * (lagun_vendedor_vendas); a soma é feita no banco. As mensagens são só a
 * quantidade por dia (lagun_vendedor_mensagens).
 */

export interface Vendedor {
  id: string;
  nome: string;
  telefone: string | null;
  cupons: string[];
  whatsapp_instancia: string | null;
  ativo: boolean;
}

export interface Resumo { ingressos: number; receita: number; mensagens: number }
export interface Meta { meta_ingressos: number; meta_receita: number; meta_mensagens: number }
export interface VendaEvento { vendedor_id: string; evento: string; ingressos: number; receita: number; por_cupom: number; manuais: number }
export interface MensagensDia { vendedor_id: string; dia: string; enviadas: number }
export interface VendaManual { id: string; vendedor_id: string; evento: string; dia: string; ingressos: number; receita: number; observacao: string | null }

export const RESUMO_VAZIO: Resumo = { ingressos: 0, receita: 0, mensagens: 0 };
export const META_VAZIA: Meta = { meta_ingressos: 0, meta_receita: 0, meta_mensagens: 0 };

// ── Datas (sempre no fuso de São Paulo) ────────────────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-10" do mês atual em São Paulo. */
export function mesAtual() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
}

export function limitesDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return { de: iso(new Date(a, m - 1, 1)), ate: iso(new Date(a, m, 0)) };
}

export function somarMeses(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nomeDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
}

/** Segunda-feira da semana de um dia "YYYY-MM-DD". */
export function inicioDaSemana(dia: string) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

/** As últimas `n` semanas (segunda a domingo), da mais antiga para a atual. */
export function ultimasSemanas(n: number) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const atual = new Date(`${inicioDaSemana(hoje)}T12:00:00`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(atual);
    d.setDate(atual.getDate() - (n - 1 - i) * 7);
    const fim = new Date(d);
    fim.setDate(d.getDate() + 6);
    return { inicio: iso(d), fim: iso(fim), rotulo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
  });
}

// ── Formatação ─────────────────────────────────────────────────────────────
export const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const fmtNum = (v: number) => v.toLocaleString('pt-BR');
export const pct = (feito: number, meta: number) => (meta > 0 ? Math.round((feito / meta) * 100) : null);

// ── Hooks ──────────────────────────────────────────────────────────────────
export function useListaVendedores() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data, error } = await (supabase as any).from('lagun_vendedores')
        .select('id, nome, telefone, cupons, whatsapp_instancia, ativo').order('nome');
      if (cancelado) return;
      if (error) console.error('[Vendedores] Falha ao carregar', error);
      setVendedores((data || []) as Vendedor[]);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [versao]);

  const ativos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);
  return { vendedores, ativos, carregando, recarregar };
}

/** Totais de cada vendedor num mês, com as metas do mês. */
export function useResumoDoMes(mes: string, versao = 0) {
  const [resumo, setResumo] = useState<Map<string, Resumo>>(new Map());
  const [metas, setMetas] = useState<Map<string, Meta>>(new Map());
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    (async () => {
      const { de, ate } = limitesDoMes(mes);
      const [r, m] = await Promise.all([
        (supabase.rpc as any)('lagun_vendedores_resumo', { p_de: de, p_ate: ate }),
        (supabase as any).from('lagun_vendedor_metas').select('vendedor_id, meta_ingressos, meta_receita, meta_mensagens').eq('mes', de),
      ]);
      if (cancelado) return;
      if (r.error) console.error('[Vendedores] Falha no resumo', r.error);
      setResumo(new Map(((r.data || []) as any[]).map((x) => [x.vendedor_id, { ingressos: Number(x.ingressos) || 0, receita: Number(x.receita) || 0, mensagens: Number(x.mensagens) || 0 }])));
      setMetas(new Map(((m.data || []) as any[]).map((x) => [x.vendedor_id, { meta_ingressos: Number(x.meta_ingressos) || 0, meta_receita: Number(x.meta_receita) || 0, meta_mensagens: Number(x.meta_mensagens) || 0 }])));
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [mes, versao]);

  return { resumo, metas, setMetas, carregando };
}
