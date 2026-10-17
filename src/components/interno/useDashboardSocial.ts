import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lembrado, lembrar } from '@/app-desktop/memoria';

/* ──────────────────────────────────────────────────────────────────────────
 * Dados do dashboard de redes sociais, compartilhados pela tela do site
 * (InternoDashboardSocial) e pela tela do app de computador
 * (app-desktop/paginas/DashboardMarketing).
 *
 * Só usa dado que a gente realmente consegue ler. Os Insights do Instagram
 * (alcance, impressões, visitas ao perfil) respondem "(#10) Application does
 * not have permission" porque o app não tem acesso avançado a read_insights —
 * então nada de card fingindo número. O que dá para medir de verdade:
 *   • perfil e publicações           → API do Instagram (funciona)
 *   • curtidas e comentários por post → API do Instagram (funciona)
 *   • DMs recebidas                   → whatsapp_messages (channel=instagram)
 *   • comentários captados            → ig_events
 *   • cliques no link                 → link_clicks
 *   • automações                      → ig_automations / ig_queue / ig_links
 * ────────────────────────────────────────────────────────────────────────── */

const db = supabase as any;
const LAGUN_IG_ID = '17841436376156784';

export interface Post {
  id: string; caption?: string; media_type?: string; permalink?: string;
  thumbnail_url?: string; media_url?: string; timestamp: string;
  like_count?: number; comments_count?: number;
}
export interface Perfil { username: string; followers_count: number; media_count: number; profile_picture_url?: string }
export interface SerieDia { dia: string; dms: number; cliques: number }
export interface EventoClique { nome: string; cliques: number }
export interface ResumoAutomacoes { ativas: number; disparos: number; dms: number; cliques: number }
/** Comentário ou direct recebido — o RPC já descarta os que são só emoji. */
export interface Interacao { texto: string | null; autor: string | null; arroba?: string | null; avatar?: string | null; quando: string }
export type Dias = 7 | 30 | 90;

export const nf = new Intl.NumberFormat('pt-BR');
export const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
export const diaCurto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** "há quanto tempo", curto: 3 min · 2 h · 5 d */
export function haQuanto(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

async function chamarInstagram(action: string, params: Record<string, string> = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada.');
  const q = new URLSearchParams({ action, ...params });
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${q}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || j.error || 'Falha ao consultar o Instagram.');
  return j;
}

/** Último resultado carregado, para a tela do app voltar já preenchida. */
interface Guardado {
  dias: Dias; perfil: Perfil | null; posts: Post[]; serie: SerieDia[]; porEvento: EventoClique[];
  totais: { dms: number; comentarios: number; cliques: number }; automacoes: ResumoAutomacoes;
  ultimosComentarios: Interacao[]; ultimosDirects: Interacao[];
}
const CHAVE_MEMORIA = 'dashboard-social';

export function useDashboardSocial() {
  const guardado = lembrado<Guardado>(CHAVE_MEMORIA);
  const [dias, setDias] = useState<Dias>(guardado?.dias ?? 30);
  // Com memória: mostra o que tinha e atualiza por baixo, sem esqueleto.
  const [carregando, setCarregando] = useState(!guardado);
  const [erroIg, setErroIg] = useState('');
  const [perfil, setPerfil] = useState<Perfil | null>(guardado?.perfil ?? null);
  const [posts, setPosts] = useState<Post[]>(guardado?.posts ?? []);
  const [serie, setSerie] = useState<SerieDia[]>(guardado?.serie ?? []);
  const [porEvento, setPorEvento] = useState<EventoClique[]>(guardado?.porEvento ?? []);
  const [totais, setTotais] = useState(guardado?.totais ?? { dms: 0, comentarios: 0, cliques: 0 });
  const [automacoes, setAutomacoes] = useState<ResumoAutomacoes>(guardado?.automacoes ?? { ativas: 0, disparos: 0, dms: 0, cliques: 0 });
  const [ultimosComentarios, setUltimosComentarios] = useState<Interacao[]>(guardado?.ultimosComentarios ?? []);
  const [ultimosDirects, setUltimosDirects] = useState<Interacao[]>(guardado?.ultimosDirects ?? []);

  useEffect(() => {
    lembrar<Guardado>(CHAVE_MEMORIA, { dias, perfil, posts, serie, porEvento, totais, automacoes, ultimosComentarios, ultimosDirects });
  }, [dias, perfil, posts, serie, porEvento, totais, automacoes, ultimosComentarios, ultimosDirects]);

  const carregar = useCallback(async () => {
    // Só mostra esqueleto quando não há nada na tela ainda.
    setCarregando((atual) => atual && !lembrado<Guardado>(CHAVE_MEMORIA)?.perfil);
    setErroIg('');

    // Instagram (pode falhar sem derrubar o resto do painel)
    const ig = chamarInstagram('accounts')
      .then(async (contas) => {
        const conta = (contas.data || []).map((p: any) => p.instagram_business_account).find(Boolean);
        if (!conta) throw new Error('Nenhuma conta do Instagram vinculada.');
        setPerfil({ username: conta.username, followers_count: conta.followers_count ?? 0, media_count: conta.media_count ?? 0, profile_picture_url: conta.profile_picture_url });
        const midia = await chamarInstagram('media', { ig_id: conta.id || LAGUN_IG_ID, limit: '50' });
        setPosts((midia.data || []) as Post[]);
      })
      .catch((e) => setErroIg(e instanceof Error ? e.message : String(e)));

    // Banco: uma RPC agrega tudo. Contar no cliente dava número errado porque
    // o PostgREST corta qualquer consulta em 1000 linhas (max_rows).
    const banco = (async () => {
      const [{ data: resumo }, { data: coments }, { data: dms }] = await Promise.all([
        db.rpc('painel_social_resumo', { p_dias: dias }),
        db.rpc('painel_ultimos_comentarios', { p_limite: 8 }),
        db.rpc('painel_ultimos_directs', { p_limite: 8 }),
      ]);
      if (resumo) {
        setSerie((resumo.serie ?? []) as SerieDia[]);
        setPorEvento((resumo.por_evento ?? []) as EventoClique[]);
        setTotais({ dms: resumo.dms ?? 0, comentarios: resumo.comentarios ?? 0, cliques: resumo.cliques ?? 0 });
        setAutomacoes(resumo.automacoes ?? { ativas: 0, disparos: 0, dms: 0, cliques: 0 });
      }
      // Nos comentários o autor já é o @.
      setUltimosComentarios(((coments ?? []) as Interacao[]).map((c) => ({ ...c, arroba: c.autor })));
      setUltimosDirects((dms ?? []) as Interacao[]);
    })();

    await Promise.all([ig, banco]);
    setCarregando(false);
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Engajamento: curtidas + comentários das publicações dentro do período.
  const postsPeriodo = useMemo(() => {
    const corte = Date.now() - dias * 86400_000;
    return posts.filter((p) => new Date(p.timestamp).getTime() >= corte);
  }, [posts, dias]);

  const engajamento = useMemo(() => {
    const base = postsPeriodo.length ? postsPeriodo : posts.slice(0, 12);
    const curtidas = base.reduce((a, p) => a + (p.like_count ?? 0), 0);
    const comentarios = base.reduce((a, p) => a + (p.comments_count ?? 0), 0);
    const seguidores = perfil?.followers_count ?? 0;
    const taxa = base.length && seguidores ? ((curtidas + comentarios) / base.length / seguidores) * 100 : 0;
    return { curtidas, comentarios, taxa, posts: base.length, usandoFallback: !postsPeriodo.length && posts.length > 0 };
  }, [postsPeriodo, posts, perfil]);

  const topPosts = useMemo(
    () => [...posts].sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0))).slice(0, 5),
    [posts],
  );

  const serieEngajamento = useMemo(
    () => [...posts]
      .filter((p) => (p.like_count ?? 0) + (p.comments_count ?? 0) > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-12)
      .map((p) => ({ dia: diaCurto(new Date(p.timestamp)), engajamento: (p.like_count ?? 0) + (p.comments_count ?? 0), tipo: p.media_type })),
    [posts],
  );

  return {
    dias, setDias, carregando, erroIg, perfil, posts, serie, porEvento, totais, automacoes,
    ultimosComentarios, ultimosDirects, engajamento, topPosts, serieEngajamento, recarregar: carregar,
  };
}
