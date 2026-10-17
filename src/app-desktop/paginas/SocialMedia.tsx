import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, FileDown, Heart, History, Instagram, Loader2, MessageCircle, Play, Sparkles, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { contasInstagram, publicacoesInstagram, nf, dataCurta, type ContaInstagram, type PublicacaoInstagram } from '@/lib/instagramApi';
import { hojeSaoPaulo } from '@/lib/relatoriosMeta';
import { RelatorioSocialMedia } from '@/components/interno/RelatorioSocialMedia';
import { baixarRelatorioPdf } from '@/lib/relatorioPdf';
import { lembrado, lembrar } from '@/app-desktop/memoria';

/**
 * Social Media no APP: as publicações do feed separadas por evento, como o
 * Performance faz com as campanhas pagas.
 *
 * O vínculo publicação → evento fica em lagun_event_posts. A tela classifica
 * sozinha o que dá para ter certeza pela legenda (nome do evento, artistas do
 * line-up, hashtags) e pela data (post perto da data do evento), gravando com
 * origem 'auto'. O que fica em dúvida vira sugestão para confirmar. Post que
 * não é de evento (institucional) é marcado como "Geral" e sai da fila.
 */
interface Evento {
  id: string; nome: string; data: string | null; dia_semana: string | null; artista: string | null;
  show_on_landing: boolean; flyer_mobile_url: string | null; flyer_desktop_url: string | null;
}
interface Vinculo { media_id: string; event_id: string | null; tipo: 'evento' | 'geral'; origem: 'manual' | 'auto' }

const DIA = 86400_000;
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
// Palavras que aparecem em todo evento e não identificam nenhum.
const GENERICAS = new Set(['lagun', 'na', 'no', 'de', 'do', 'da', 'e', 'o', 'a', 'in', 'the', 'special', 'guests', 'guest', 'convidados', 'convidado', 'none', 'dj', 'mc', 'night', 'music', 'electronic', 'eletronic', 'experience', 'line', 'secret', 'welcome', 'party', 'festa']);

/** Chaves que identificam o evento: nome inteiro, nome sem palavras genéricas e cada artista do line-up. */
function chavesDoEvento(e: Evento): { chave: string; peso: number }[] {
  const chaves: { chave: string; peso: number }[] = [];
  const nome = normalizar(e.nome);
  if (nome.length >= 4) chaves.push({ chave: nome, peso: 3 });
  const nomeLimpo = nome.split(' ').filter((p) => !GENERICAS.has(p)).join(' ');
  if (nomeLimpo.length >= 4 && nomeLimpo !== nome) chaves.push({ chave: nomeLimpo, peso: 2.5 });
  for (const parte of (e.artista || '').split(/[,&+]| e |\/|\n/)) {
    const a = normalizar(parte).split(' ').filter((p) => !GENERICAS.has(p)).join(' ');
    if (a.length >= 4) chaves.push({ chave: a, peso: 2 });
  }
  return chaves;
}

/**
 * Pontua cada evento para a publicação. Chave encontrada na legenda soma o
 * peso (chave mais longa vale mais); post publicado até 21 dias antes ou 3
 * dias depois do evento ganha bônus; longe da data perde força. Devolve o
 * melhor e se há certeza (melhor bem acima do segundo).
 */
function classificar(post: PublicacaoInstagram, eventos: Evento[]): { melhor: Evento | null; certo: boolean } {
  const legenda = ` ${normalizar(post.caption || '')} `;
  if (legenda.trim().length < 3) return { melhor: null, certo: false };
  const quando = new Date(post.timestamp).getTime();
  const pontuados = eventos.map((e) => {
    let pontos = 0;
    for (const { chave, peso } of chavesDoEvento(e)) {
      if (legenda.includes(` ${chave} `) || legenda.includes(chave.replace(/ /g, ''))) pontos += peso + Math.min(chave.length, 20) / 20;
    }
    if (pontos === 0) return { e, pontos: 0 };
    if (e.data) {
      const dataEvento = new Date(`${e.data.slice(0, 10)}T12:00:00`).getTime();
      const dias = (dataEvento - quando) / DIA; // positivo = post antes do evento
      if (dias >= -3 && dias <= 21) pontos += 2;
      else if (dias >= -10 && dias <= 45) pontos += 0.5;
      else pontos -= 2.5;
    }
    return { e, pontos };
  }).filter((x) => x.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  const [primeiro, segundo] = pontuados;
  if (!primeiro) return { melhor: null, certo: false };
  const certo = primeiro.pontos >= 4 && (!segundo || primeiro.pontos - segundo.pontos >= 1.5);
  return { melhor: primeiro.e, certo };
}

const formatarData = (e: Evento) => {
  if (!e.data) return e.dia_semana || 'Sem data';
  const [, m, d] = e.data.slice(0, 10).split('-');
  return `${d}/${m}${e.dia_semana ? ` · ${e.dia_semana}` : ''}`;
};
const flyer = (e: Evento) => e.flyer_mobile_url || e.flyer_desktop_url || null;
const engaj = (p: PublicacaoInstagram) => (p.like_count ?? 0) + (p.comments_count ?? 0);
const pctTxt = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
const porDataDesc = (a: PublicacaoInstagram, b: PublicacaoInstagram) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

function Superficie({ titulo, sub, acao, className = '', children }: { titulo: string; sub?: ReactNode; acao?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`app-superficie flex flex-col p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] tracking-[0.12em] text-white">{titulo}</h2>
          {sub && <p className="mt-1 text-[11.5px] leading-snug text-white/45">{sub}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** Miniatura de publicação: foto quadrada; curtidas e comentários aparecem ao passar o mouse. */
function Miniatura({ p, tamanho = 64, onRemover, auto }: { p: PublicacaoInstagram; tamanho?: number; onRemover?: () => void; auto?: boolean }) {
  const foto = p.thumbnail_url || p.media_url;
  return (
    <div className="group/post relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <a href={p.permalink} target="_blank" rel="noreferrer" title={`${p.caption?.slice(0, 160) || 'Publicação'}${auto ? '\n(classificada automaticamente pela legenda)' : ''}`}
        className="relative block h-full w-full overflow-hidden rounded-[12px] bg-white/[0.05] ring-1 ring-white/10 transition-[box-shadow] hover:ring-[#FFE14D]/60">
        {foto && <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
        {p.media_type === 'VIDEO' && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/60"><Play size={8} className="fill-white text-white" /></span>}
        {auto && <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-[#FFE14D]"><Sparkles size={9} /></span>}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 text-[9.5px] font-semibold text-white opacity-0 transition-opacity group-hover/post:opacity-100">
          <span className="flex items-center gap-0.5"><Heart size={9} className="fill-[#F9A8D4] text-[#F9A8D4]" />{nf.format(p.like_count ?? 0)}</span>
          <span className="flex items-center gap-0.5"><MessageCircle size={9} className="text-[#8FB4FF]" />{nf.format(p.comments_count ?? 0)}</span>
        </span>
      </a>
      {onRemover && (
        <button type="button" title="Tirar daqui" onClick={onRemover}
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-black text-white/70 ring-1 ring-white/20 hover:text-red-400 group-hover/post:grid">
          <X size={11} />
        </button>
      )}
    </div>
  );
}

/**
 * Fileira de miniaturas do cartão de evento: mede a largura e mostra só as que
 * cabem numa linha; se sobrar publicação, o último espaço vira o "+N".
 */
const MINI = 56;
const VAO = 8;
function FileiraMiniaturas({ lista, auto, onRemover, onMais }: { lista: PublicacaoInstagram[]; auto: (p: PublicacaoInstagram) => boolean; onRemover: (p: PublicacaoInstagram) => void; onMais: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cabem, setCabem] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setCabem(Math.max(1, Math.floor((el.clientWidth + VAO) / (MINI + VAO))));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const sobra = lista.length > cabem;
  const visiveis = cabem ? lista.slice(0, sobra ? cabem - 1 : cabem) : [];
  return (
    <div ref={ref} className="flex min-w-0 gap-2 overflow-hidden">
      {visiveis.map((p) => <Miniatura key={p.id} p={p} tamanho={MINI} auto={auto(p)} onRemover={() => onRemover(p)} />)}
      {cabem > 0 && sobra && (
        <button type="button" onClick={onMais} className="app-titulo grid h-14 w-14 shrink-0 place-items-center rounded-[12px] border border-white/10 text-[15px] text-white/60 hover:border-[#FFE14D]/60 hover:text-[#FFE14D]">+{lista.length - visiveis.length}</button>
      )}
    </div>
  );
}

export default function SocialMedia() {
  const guardado = lembrado<{ conta: ContaInstagram | null; posts: PublicacaoInstagram[]; limite: number; eventos?: Evento[]; vinculos?: Vinculo[] }>('social-media');
  const [conta, setConta] = useState<ContaInstagram | null>(guardado?.conta ?? null);
  const [posts, setPosts] = useState<PublicacaoInstagram[]>(guardado?.posts ?? []);
  const [limite, setLimite] = useState(guardado?.limite ?? 100);
  const [eventos, setEventos] = useState<Evento[]>(guardado?.eventos ?? []);
  const [vinculos, setVinculos] = useState<Map<string, Vinculo>>(new Map((guardado?.vinculos ?? []).map((v) => [v.media_id, v])));
  const [carregando, setCarregando] = useState(!guardado);
  // Eventos e vínculos chegam separados dos posts (que podem vir da memória):
  // sem eles não dá para dizer o que está vazio, então até lá é esqueleto.
  const [eventosCarregados, setEventosCarregados] = useState(Boolean(guardado?.eventos));
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [verPassados, setVerPassados] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [classificando, setClassificando] = useState(0);
  const jaClassificou = useRef(new Set<string>());

  useEffect(() => {
    lembrar('social-media', { conta, posts, limite, ...(eventosCarregados ? { eventos, vinculos: [...vinculos.values()] } : {}) });
  }, [conta, posts, limite, eventos, vinculos, eventosCarregados]);

  const carregar = useCallback(async () => {
    setCarregando((c) => c && posts.length === 0);
    try {
      const [contas, { data: evs }, { data: vs }] = await Promise.all([
        contasInstagram(),
        (supabase as any).from('lagun_events').select('id, nome, data, dia_semana, artista, show_on_landing, flyer_mobile_url, flyer_desktop_url').order('data', { ascending: false }),
        (supabase as any).from('lagun_event_posts').select('media_id, event_id, tipo, origem'),
      ]);
      setEventos((evs ?? []) as Evento[]);
      setVinculos(new Map(((vs ?? []) as Vinculo[]).map((v) => [v.media_id, v])));
      setEventosCarregados(true);
      const c = contas[0] ?? null;
      setConta(c);
      if (c) setPosts(await publicacoesInstagram(c.id, limite));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o Instagram.');
    } finally {
      setCarregando(false);
      setEventosCarregados(true);
    }
  }, [limite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar(); }, [carregar]);

  const gravar = useCallback(async (p: PublicacaoInstagram, v: Omit<Vinculo, 'media_id'> | null) => {
    setSalvando((s) => new Set(s).add(p.id));
    setVinculos((m) => { const n = new Map(m); if (v) n.set(p.id, { media_id: p.id, ...v }); else n.delete(p.id); return n; });
    const { error } = v
      ? await (supabase as any).from('lagun_event_posts').upsert({ media_id: p.id, event_id: v.event_id, tipo: v.tipo, origem: v.origem, caption: p.caption ?? null, permalink: p.permalink ?? null, posted_at: p.timestamp, updated_at: new Date().toISOString() })
      : await (supabase as any).from('lagun_event_posts').delete().eq('media_id', p.id);
    setSalvando((s) => { const n = new Set(s); n.delete(p.id); return n; });
    if (error) { toast.error('Não foi possível salvar a classificação.'); void carregar(); }
  }, [carregar]);

  const vincular = (p: PublicacaoInstagram, eventId: string) => gravar(p, { event_id: eventId, tipo: 'evento', origem: 'manual' });
  const marcarGeral = (p: PublicacaoInstagram) => gravar(p, { event_id: null, tipo: 'geral', origem: 'manual' });
  const desfazer = (p: PublicacaoInstagram) => gravar(p, null);

  // Classificação automática: o que a legenda e a data deixam certo entra
  // sozinho (origem 'auto'); roda uma vez por publicação carregada.
  const classificacoes = useMemo(() => new Map(posts.map((p) => [p.id, classificar(p, eventos)] as const)), [posts, eventos]);
  useEffect(() => {
    if (carregando || !eventosCarregados || !eventos.length) return;
    const certos = posts.filter((p) => !vinculos.has(p.id) && !jaClassificou.current.has(p.id) && classificacoes.get(p.id)?.certo);
    if (!certos.length) return;
    certos.forEach((p) => jaClassificou.current.add(p.id));
    (async () => {
      setClassificando(certos.length);
      for (const p of certos) await gravar(p, { event_id: classificacoes.get(p.id)!.melhor!.id, tipo: 'evento', origem: 'auto' });
      setClassificando(0);
      toast.success(`${certos.length} ${certos.length === 1 ? 'publicação classificada' : 'publicações classificadas'} pela legenda.`);
    })();
  }, [carregando, eventosCarregados, posts, eventos, vinculos, classificacoes, gravar]);

  const hoje = hojeSaoPaulo();
  const ativos = useMemo(() => eventos.filter((e) => e.show_on_landing && (!e.data || e.data.slice(0, 10) >= hoje)).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')), [eventos, hoje]);
  const passados = useMemo(() => eventos.filter((e) => !ativos.includes(e)), [eventos, ativos]);
  const porEvento = useMemo(() => {
    const m = new Map<string, PublicacaoInstagram[]>();
    for (const p of posts) { const ev = vinculos.get(p.id)?.event_id; if (ev) m.set(ev, [...(m.get(ev) ?? []), p]); }
    return m;
  }, [posts, vinculos]);
  const gerais = useMemo(() => posts.filter((p) => vinculos.get(p.id)?.tipo === 'geral').sort(porDataDesc), [posts, vinculos]);
  const semEvento = useMemo(() => posts.filter((p) => !vinculos.has(p.id)).sort(porDataDesc), [posts, vinculos]);
  const sugestoes = useMemo(() => new Map(semEvento.map((p) => [p.id, classificacoes.get(p.id)?.melhor ?? null] as const).filter(([, e]) => e)), [semEvento, classificacoes]);
  const passadosComPosts = passados.filter((e) => (porEvento.get(e.id)?.length ?? 0) > 0);
  const listaEventos = verPassados ? passadosComPosts : ativos;

  const seguidores = conta?.followers_count ?? 0;
  const curtidas = posts.reduce((t, p) => t + (p.like_count ?? 0), 0);
  const comentarios = posts.reduce((t, p) => t + (p.comments_count ?? 0), 0);
  const taxa = posts.length && seguidores ? ((curtidas + comentarios) / posts.length / seguidores) * 100 : 0;
  const classificados = posts.length - semEvento.length;

  const aceitarTodas = async () => {
    const pares = [...sugestoes.entries()];
    for (const [id, ev] of pares) { const p = semEvento.find((x) => x.id === id); if (p && ev) await vincular(p, ev.id); }
    toast.success(`${pares.length} ${pares.length === 1 ? 'publicação vinculada' : 'publicações vinculadas'}.`);
  };

  const gerarPdf = async () => {
    if (!conta) return;
    setGerandoPdf(true);
    try {
      await baixarRelatorioPdf(
        <RelatorioSocialMedia usuario={conta.username} seguidores={seguidores} publicacoes={posts.length} curtidas={curtidas} comentarios={comentarios} engajamento={taxa ? pctTxt(taxa) : '—'}
          posts={posts.map((m) => ({ id: m.id, legenda: m.caption ?? '', data: m.timestamp, tipo: m.media_type ?? 'IMAGE', curtidas: m.like_count ?? 0, comentarios: m.comments_count ?? 0 }))} />,
        'relatorio-social-media-lagun',
      );
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao gerar o PDF'); } finally { setGerandoPdf(false); }
  };

  /** Cartão compacto de um evento: capa pequena, nome, números em linha e uma fileira de miniaturas. */
  const CartaoEvento = ({ e }: { e: Evento }) => {
    const lista = (porEvento.get(e.id) ?? []).sort(porDataDesc);
    const c = lista.reduce((t, p) => t + (p.like_count ?? 0), 0);
    const k = lista.reduce((t, p) => t + (p.comments_count ?? 0), 0);
    const tx = lista.length && seguidores ? ((c + k) / lista.length / seguidores) * 100 : 0;
    const expandido = aberto === e.id;
    const f = flyer(e);
    return (
      <article className="app-superficie flex min-w-0 flex-col p-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.05] ring-1 ring-white/10">
            {f ? <img src={f} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-white/30"><Instagram size={16} /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="app-eyebrow text-[9.5px]">{formatarData(e)}</p>
            <h3 className="app-titulo mt-0.5 truncate text-[19px] text-white">{e.nome}</h3>
            {e.artista && <p className="truncate text-[11.5px] text-white/45">{e.artista}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/[0.07] pt-3">
          {([['Posts', nf.format(lista.length), '#F4F2EA'], ['Curtidas', nf.format(c), '#F9A8D4'], ['Coment.', nf.format(k), '#8FB4FF'], ['Engaj.', tx ? pctTxt(tx) : '—', '#FFE14D']] as const).map(([l, v, cor]) => (
            <div key={l} className="min-w-0"><p className="app-eyebrow text-[9px]">{l}</p><p className="app-titulo text-[18px]" style={{ color: cor }}>{v}</p></div>
          ))}
        </div>
        <div className="mt-3 min-h-[56px] min-w-0">
          {lista.length ? (
            expandido ? (
              <div className="flex flex-wrap gap-2">
                {lista.map((p) => <Miniatura key={p.id} p={p} tamanho={MINI} auto={vinculos.get(p.id)?.origem === 'auto'} onRemover={() => void desfazer(p)} />)}
                <button type="button" onClick={() => setAberto(null)} className="app-aba h-14 px-3 text-[10.5px]">Menos</button>
              </div>
            ) : (
              <FileiraMiniaturas lista={lista} auto={(p) => vinculos.get(p.id)?.origem === 'auto'} onRemover={(p) => void desfazer(p)} onMais={() => setAberto(e.id)} />
            )
          ) : (
            <p className="text-[11.5px] leading-snug text-white/30">Sem publicação ainda.</p>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Letreiro ───────────────────────────────────────────────────── */}
      <section className="app-superficie app-superficie--alta overflow-hidden">
        <div className="flex items-center justify-between gap-6 border-b border-white/[0.07] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {conta?.profile_picture_url
              ? <img src={conta.profile_picture_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-[#FFE14D]/40" />
              : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/60 ring-1 ring-white/10"><Instagram size={18} /></span>}
            <div className="min-w-0">
              <p className="app-eyebrow">Instagram conectado</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold text-white">
                {conta ? `@${conta.username}` : (carregando ? 'carregando…' : 'sem conta vinculada')}
                {posts.length > 0 && eventosCarregados && <span className="ml-2 font-normal text-white/40">· {classificados} de {posts.length} classificadas{classificando ? ` · classificando ${classificando}…` : ''}</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/40 p-1">
              {[50, 100, 200].map((v) => (
                <button key={v} type="button" onClick={() => setLimite(v)} className={`app-aba h-8 px-3.5 text-[11.5px] ${limite === v ? 'ativo' : ''}`}>{v} posts</button>
              ))}
            </div>
            <button type="button" onClick={() => void gerarPdf()} disabled={gerandoPdf || !conta} className="app-aba ativo h-9 px-4 text-[11.5px] disabled:opacity-50">
              {gerandoPdf ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
            </button>
          </div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-white/[0.07]">
          {([
            ['Seguidores', nf.format(seguidores), 'conta profissional', true],
            ['Publicações', nf.format(posts.length), 'carregadas', false],
            ['Curtidas', nf.format(curtidas), 'somadas nas publicações', false],
            ['Comentários', nf.format(comentarios), 'somados nas publicações', false],
            ['Engajamento', taxa ? pctTxt(taxa) : '—', 'média por publicação', false],
          ] as const).map(([l, v, s, neon]) => (
            <div key={l} className="px-6 py-5">
              <p className="app-eyebrow">{l}</p>
              <p className={`app-letreiro mt-2 ${neon ? 'app-letreiro--neon' : ''}`}>{carregando && !posts.length ? <span className="inline-block h-9 w-24 animate-pulse rounded-md bg-white/[0.06] align-middle" /> : v}</p>
              <p className="mt-1.5 text-[11.5px] text-white/40">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Eventos ────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 px-1 pt-1">
        <div className="flex items-baseline gap-3">
          <h2 className="app-titulo text-[24px] text-white">{verPassados ? 'Eventos passados' : 'Eventos ativos'}</h2>
          {eventosCarregados && <span className="app-titulo text-[24px] text-white/30">{listaEventos.length}</span>}
          <span className="app-eyebrow ml-2">Publicações por evento</span>
        </div>
        <button type="button" onClick={() => setVerPassados((v) => !v)} className={`app-aba h-9 px-4 text-[11.5px] ${verPassados ? 'ativo' : ''}`}>
          <History size={13} /> Eventos passados
        </button>
      </div>

      {!eventosCarregados ? (
        <div className="grid grid-cols-3 gap-4"><div className="app-esqueleto h-[196px]" /><div className="app-esqueleto h-[196px]" /><div className="app-esqueleto h-[196px]" /></div>
      ) : listaEventos.length === 0 ? (
        <div className="app-superficie px-6 py-10 text-center">
          <p className="app-titulo text-[20px] text-white/70">{verPassados ? 'Nenhum evento passado com publicação' : 'Nenhum evento ativo na landing'}</p>
          <p className="mt-2 text-[12.5px] text-white/40">{verPassados ? 'Vincule publicações a eventos antigos na lista de baixo.' : 'Eventos aparecem aqui quando estão na landing e a data ainda não passou.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {listaEventos.map((e) => <CartaoEvento key={e.id} e={e} />)}
        </div>
      )}

      {/* ── Geral (não é de evento) ────────────────────────────────────── */}
      {eventosCarregados && gerais.length > 0 && (
        <Superficie titulo={`Geral · ${gerais.length}`} sub="Publicações da casa que não são de um evento: institucional, bastidor, aviso. Passe o mouse e clique no X para voltar à fila.">
          <div className="flex flex-wrap gap-2">
            {gerais.map((p) => <Miniatura key={p.id} p={p} tamanho={56} onRemover={() => void desfazer(p)} />)}
          </div>
        </Superficie>
      )}

      {/* ── Sem evento ─────────────────────────────────────────────────── */}
      <Superficie
        titulo={eventosCarregados ? `Sem evento · ${semEvento.length}` : 'Sem evento'}
        sub="O que a legenda não deixou certo. Confirme a sugestão, escolha o evento ou marque como geral."
        acao={eventosCarregados && sugestoes.size > 0 && (
          <button type="button" onClick={() => void aceitarTodas()} className="app-aba ativo h-9 px-4 text-[11.5px]">
            <Sparkles size={13} /> Aceitar {sugestoes.size} {sugestoes.size === 1 ? 'sugestão' : 'sugestões'}
          </button>
        )}
      >
        {!eventosCarregados || (carregando && !posts.length) ? (
          <div className="flex flex-col gap-2"><div className="app-esqueleto h-[76px]" /><div className="app-esqueleto h-[76px]" /><div className="app-esqueleto h-[76px]" /></div>
        ) : semEvento.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-white/40">{posts.length ? 'Todas as publicações carregadas estão classificadas.' : 'Nenhuma publicação carregada.'}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {semEvento.map((p) => {
              const sug = sugestoes.get(p.id) ?? null;
              const ocupado = salvando.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-4 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <Miniatura p={p} tamanho={60} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12.5px] leading-snug text-white/75">{p.caption || <span className="text-white/35">Publicação sem legenda.</span>}</p>
                    <p className="mt-1 text-[11px] text-white/35">{dataCurta(p.timestamp)} · {nf.format(engaj(p))} interações</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sug && (
                      <button type="button" disabled={ocupado} onClick={() => void vincular(p, sug.id)} title={`Sugestão pela legenda e pela data. Clique para vincular a ${sug.nome}.`}
                        className="app-aba h-8 max-w-[220px] gap-1.5 border-dashed border-[#FFE14D]/50 px-3 text-[11px] text-[#FFEC8A] hover:border-[#FFE14D] disabled:opacity-50">
                        <Check size={12} className="shrink-0" /><span className="truncate">{sug.nome}</span>
                      </button>
                    )}
                    <select value="" disabled={ocupado} onChange={(ev) => { if (ev.target.value) void vincular(p, ev.target.value); }}
                      className="h-8 max-w-[190px] rounded-full border border-white/15 bg-black/40 px-3 text-[11.5px] text-white/70 outline-none focus:border-[#FFE14D]/60">
                      <option value="">{sug ? 'Outro evento…' : 'Escolher evento…'}</option>
                      {ativos.length > 0 && <optgroup label="Ativos">{ativos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
                      {passados.length > 0 && <optgroup label="Passados">{passados.slice(0, 60).map((e) => <option key={e.id} value={e.id}>{e.nome}{e.data ? ` · ${e.data.slice(8, 10)}/${e.data.slice(5, 7)}` : ''}</option>)}</optgroup>}
                    </select>
                    <button type="button" disabled={ocupado} onClick={() => void marcarGeral(p)} title="Não é de evento: institucional, bastidor, aviso" className="app-aba h-8 px-3 text-[11px] disabled:opacity-50">
                      <Tag size={12} /> Geral
                    </button>
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:text-[#FFEC8A]" title="Abrir no Instagram"><ArrowUpRight size={14} /></a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Superficie>
    </div>
  );
}
