import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, FileDown, Heart, History, Instagram, Loader2, MessageCircle, Play, Sparkles, X } from 'lucide-react';
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
 * O vínculo publicação → evento fica em lagun_event_posts. A tela sugere o
 * evento pela legenda (nome do evento ou do artista aparece no texto) e a
 * equipe confirma com um clique; dá para aceitar todas as sugestões de uma
 * vez. Publicações sem evento ficam no fim, esperando classificação.
 */
interface Evento {
  id: string; nome: string; data: string | null; dia_semana: string | null; artista: string | null;
  show_on_landing: boolean; flyer_mobile_url: string | null; flyer_desktop_url: string | null;
}
interface Vinculo { media_id: string; event_id: string }

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Evento cuja chave (nome ou artista) aparece na legenda. Em empate, o de data mais perto da publicação. */
function sugerirEvento(post: PublicacaoInstagram, eventos: Evento[]): Evento | null {
  const legenda = semAcento(post.caption || '');
  if (!legenda) return null;
  const quando = new Date(post.timestamp).getTime();
  const candidatos = eventos.filter((e) => {
    const chaves = [e.nome, e.artista].filter((x): x is string => !!x && semAcento(x).length >= 3);
    return chaves.some((c) => legenda.includes(semAcento(c)));
  });
  return candidatos.sort((a, b) => {
    const da = a.data ? Math.abs(new Date(`${a.data.slice(0, 10)}T12:00:00`).getTime() - quando) : Infinity;
    const db = b.data ? Math.abs(new Date(`${b.data.slice(0, 10)}T12:00:00`).getTime() - quando) : Infinity;
    return da - db;
  })[0] || null;
}

const formatarData = (e: Evento) => {
  if (!e.data) return e.dia_semana || 'Sem data';
  const [, m, d] = e.data.slice(0, 10).split('-');
  return `${d}/${m}${e.dia_semana ? ` · ${e.dia_semana}` : ''}`;
};
const flyer = (e: Evento) => e.flyer_mobile_url || e.flyer_desktop_url || null;
const engaj = (p: PublicacaoInstagram) => (p.like_count ?? 0) + (p.comments_count ?? 0);

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

/** Miniatura de publicação: foto quadrada, curtidas e comentários por cima ao passar o mouse. */
function Miniatura({ p, tamanho = 'h-24 w-24' }: { p: PublicacaoInstagram; tamanho?: string }) {
  const foto = p.thumbnail_url || p.media_url;
  return (
    <a href={p.permalink} target="_blank" rel="noreferrer" title={p.caption?.slice(0, 140)}
      className={`group relative shrink-0 overflow-hidden rounded-[14px] bg-white/[0.05] ring-1 ring-white/10 transition-[box-shadow] hover:ring-[#FFE14D]/60 ${tamanho}`}>
      {foto && <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
      {p.media_type === 'VIDEO' && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60"><Play size={10} className="fill-white text-white" /></span>}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5 text-[10.5px] font-semibold text-white">
        <span className="flex items-center gap-1"><Heart size={10} className="fill-[#F9A8D4] text-[#F9A8D4]" />{nf.format(p.like_count ?? 0)}</span>
        <span className="flex items-center gap-1"><MessageCircle size={10} className="text-[#8FB4FF]" />{nf.format(p.comments_count ?? 0)}</span>
      </span>
    </a>
  );
}

export default function SocialMedia() {
  const guardado = lembrado<{ conta: ContaInstagram | null; posts: PublicacaoInstagram[]; limite: number }>('social-media');
  const [conta, setConta] = useState<ContaInstagram | null>(guardado?.conta ?? null);
  const [posts, setPosts] = useState<PublicacaoInstagram[]>(guardado?.posts ?? []);
  const [limite, setLimite] = useState(guardado?.limite ?? 100);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(!guardado);
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [verPassados, setVerPassados] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => { lembrar('social-media', { conta, posts, limite }); }, [conta, posts, limite]);

  const carregar = useCallback(async () => {
    setCarregando((c) => c && posts.length === 0);
    try {
      const [contas, { data: evs }, { data: vs }] = await Promise.all([
        contasInstagram(),
        (supabase as any).from('lagun_events').select('id, nome, data, dia_semana, artista, show_on_landing, flyer_mobile_url, flyer_desktop_url').order('data', { ascending: false }),
        (supabase as any).from('lagun_event_posts').select('media_id, event_id'),
      ]);
      setEventos((evs ?? []) as Evento[]);
      setVinculos(new Map(((vs ?? []) as Vinculo[]).map((v) => [v.media_id, v.event_id])));
      const c = contas[0] ?? null;
      setConta(c);
      if (c) setPosts(await publicacoesInstagram(c.id, limite));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o Instagram.');
    } finally {
      setCarregando(false);
    }
  }, [limite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar(); }, [carregar]);

  const vincular = useCallback(async (p: PublicacaoInstagram, eventId: string | null) => {
    setSalvando((s) => new Set(s).add(p.id));
    setVinculos((m) => { const n = new Map(m); if (eventId) n.set(p.id, eventId); else n.delete(p.id); return n; });
    const { error } = eventId
      ? await (supabase as any).from('lagun_event_posts').upsert({ media_id: p.id, event_id: eventId, caption: p.caption ?? null, permalink: p.permalink ?? null, posted_at: p.timestamp, updated_at: new Date().toISOString() })
      : await (supabase as any).from('lagun_event_posts').delete().eq('media_id', p.id);
    setSalvando((s) => { const n = new Set(s); n.delete(p.id); return n; });
    if (error) { toast.error('Não foi possível salvar o vínculo.'); void carregar(); }
  }, [carregar]);

  const hoje = hojeSaoPaulo();
  const ativos = useMemo(() => eventos.filter((e) => e.show_on_landing && (!e.data || e.data.slice(0, 10) >= hoje)).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')), [eventos, hoje]);
  const passados = useMemo(() => eventos.filter((e) => !ativos.includes(e)), [eventos, ativos]);
  const porEvento = useMemo(() => {
    const m = new Map<string, PublicacaoInstagram[]>();
    for (const p of posts) { const ev = vinculos.get(p.id); if (ev) m.set(ev, [...(m.get(ev) ?? []), p]); }
    return m;
  }, [posts, vinculos]);
  const semEvento = useMemo(() => posts.filter((p) => !vinculos.has(p.id)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [posts, vinculos]);
  const sugestoes = useMemo(() => new Map(semEvento.map((p) => [p.id, sugerirEvento(p, eventos)] as const).filter(([, e]) => e)), [semEvento, eventos]);
  // Passados só aparecem se tiverem publicação; os ativos sempre, mesmo vazios.
  const passadosComPosts = passados.filter((e) => (porEvento.get(e.id)?.length ?? 0) > 0);

  const seguidores = conta?.followers_count ?? 0;
  const curtidas = posts.reduce((t, p) => t + (p.like_count ?? 0), 0);
  const comentarios = posts.reduce((t, p) => t + (p.comments_count ?? 0), 0);
  const taxa = posts.length && seguidores ? ((curtidas + comentarios) / posts.length / seguidores) * 100 : 0;
  const pctTxt = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

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

  const CartaoEvento = ({ e }: { e: Evento }) => {
    const lista = (porEvento.get(e.id) ?? []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const c = lista.reduce((t, p) => t + (p.like_count ?? 0), 0);
    const k = lista.reduce((t, p) => t + (p.comments_count ?? 0), 0);
    const tx = lista.length && seguidores ? ((c + k) / lista.length / seguidores) * 100 : 0;
    const expandido = aberto === e.id;
    const f = flyer(e);
    return (
      <article className="app-superficie overflow-hidden">
        <div className="flex items-stretch gap-4 p-4">
          <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[14px] bg-white/[0.05] ring-1 ring-white/10">
            {f ? <img src={f} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-white/30"><Instagram size={20} /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="app-eyebrow">{formatarData(e)}</p>
            <h3 className="app-titulo mt-1 truncate text-[24px] text-white">{e.nome}</h3>
            {e.artista && <p className="truncate text-[12.5px] text-white/50">{e.artista}</p>}
            <div className="mt-2 flex items-end gap-6">
              {([['Posts', nf.format(lista.length), '#F4F2EA'], ['Curtidas', nf.format(c), '#F9A8D4'], ['Comentários', nf.format(k), '#8FB4FF'], ['Engajamento', tx ? pctTxt(tx) : '—', '#FFE14D']] as const).map(([l, v, cor]) => (
                <div key={l}><p className="app-eyebrow text-[9.5px]">{l}</p><p className="app-titulo text-[22px]" style={{ color: cor }}>{v}</p></div>
              ))}
            </div>
          </div>
        </div>
        {lista.length > 0 ? (
          <div className="border-t border-white/[0.07] px-4 py-3">
            <div className={`flex gap-2 ${expandido ? 'flex-wrap' : 'overflow-hidden'}`}>
              {(expandido ? lista : lista.slice(0, 6)).map((p) => (
                <div key={p.id} className="group/post relative">
                  <Miniatura p={p} tamanho="h-[84px] w-[84px]" />
                  <button type="button" title="Tirar deste evento" onClick={() => void vincular(p, null)} disabled={salvando.has(p.id)}
                    className="absolute -right-1 -top-1 hidden h-5 w-5 place-items-center rounded-full bg-black text-white/70 ring-1 ring-white/20 hover:text-red-400 group-hover/post:grid">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            {lista.length > 6 && (
              <button type="button" onClick={() => setAberto(expandido ? null : e.id)} className="app-aba mt-3 h-8 px-3 text-[11px]">
                {expandido ? 'Mostrar menos' : `Ver todas as ${lista.length}`}
              </button>
            )}
          </div>
        ) : (
          <p className="border-t border-white/[0.07] px-4 py-3 text-[12px] text-white/35">Nenhuma publicação vinculada. Escolha o evento nas publicações sem evento, abaixo.</p>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Letreiro ───────────────────────────────────────────────────── */}
      <section className="app-superficie app-superficie--alta overflow-hidden">
        <div className="flex items-center justify-between gap-6 border-b border-white/[0.07] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {conta?.profile_picture_url
              ? <img src={conta.profile_picture_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-[#FFE14D]/40" />
              : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/60 ring-1 ring-white/10"><Instagram size={18} /></span>}
            <div className="min-w-0">
              <p className="app-eyebrow">Instagram conectado</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold text-white">{conta ? `@${conta.username}` : (carregando ? 'carregando…' : 'sem conta vinculada')}</p>
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
      <div className="flex items-end justify-between gap-4 px-1 pt-2">
        <div>
          <p className="app-eyebrow">Publicações por evento</p>
          <h2 className="app-titulo mt-1 text-[26px] text-white">{verPassados ? 'Eventos passados' : 'Eventos ativos'} <span className="text-white/30">{(verPassados ? passadosComPosts : ativos).length}</span></h2>
        </div>
        <button type="button" onClick={() => setVerPassados((v) => !v)} className={`app-aba h-9 px-4 text-[11.5px] ${verPassados ? 'ativo' : ''}`}>
          <History size={13} /> Eventos passados
        </button>
      </div>

      {carregando && !posts.length ? (
        <div className="grid grid-cols-2 gap-4"><div className="app-esqueleto h-[220px]" /><div className="app-esqueleto h-[220px]" /></div>
      ) : (verPassados ? passadosComPosts : ativos).length === 0 ? (
        <div className="app-superficie px-6 py-12 text-center">
          <p className="app-titulo text-[22px] text-white/70">{verPassados ? 'Nenhum evento passado com publicação' : 'Nenhum evento ativo na landing'}</p>
          <p className="mt-2 text-[12.5px] text-white/40">{verPassados ? 'Vincule publicações a eventos antigos na lista de baixo.' : 'Eventos aparecem aqui quando estão na landing e a data ainda não passou.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {(verPassados ? passadosComPosts : ativos).map((e) => <CartaoEvento key={e.id} e={e} />)}
        </div>
      )}

      {/* ── Sem evento ─────────────────────────────────────────────────── */}
      <Superficie
        titulo={`Sem evento · ${semEvento.length}`}
        sub="Publicações que ainda não foram classificadas. A sugestão vem da legenda; confirme ou escolha outro evento."
        acao={sugestoes.size > 0 && (
          <button type="button" onClick={() => void aceitarTodas()} className="app-aba ativo h-9 px-4 text-[11.5px]">
            <Sparkles size={13} /> Aceitar {sugestoes.size} {sugestoes.size === 1 ? 'sugestão' : 'sugestões'}
          </button>
        )}
      >
        {semEvento.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-white/40">{posts.length ? 'Todas as publicações carregadas têm evento.' : 'Nenhuma publicação carregada.'}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {semEvento.map((p) => {
              const sug = sugestoes.get(p.id) ?? null;
              const ocupado = salvando.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-4 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <Miniatura p={p} tamanho="h-16 w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12.5px] leading-snug text-white/75">{p.caption || <span className="text-white/35">Publicação sem legenda.</span>}</p>
                    <p className="mt-1 text-[11px] text-white/35">{dataCurta(p.timestamp)} · {nf.format(engaj(p))} interações</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sug && (
                      <button type="button" disabled={ocupado} onClick={() => void vincular(p, sug.id)} title={`Sugestão pela legenda. Clique para vincular a ${sug.nome}.`}
                        className="app-aba h-8 max-w-[220px] gap-1.5 border-dashed border-[#FFE14D]/50 px-3 text-[11px] text-[#FFEC8A] hover:border-[#FFE14D] disabled:opacity-50">
                        <Check size={12} className="shrink-0" /><span className="truncate">{sug.nome}</span>
                      </button>
                    )}
                    <select value="" disabled={ocupado} onChange={(ev) => { if (ev.target.value) void vincular(p, ev.target.value); }}
                      className="h-8 max-w-[200px] rounded-full border border-white/15 bg-black/40 px-3 text-[11.5px] text-white/70 outline-none focus:border-[#FFE14D]/60">
                      <option value="">{sug ? 'Outro evento…' : 'Escolher evento…'}</option>
                      {ativos.length > 0 && <optgroup label="Ativos">{ativos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>}
                      {passados.length > 0 && <optgroup label="Passados">{passados.slice(0, 40).map((e) => <option key={e.id} value={e.id}>{e.nome}{e.data ? ` · ${e.data.slice(8, 10)}/${e.data.slice(5, 7)}` : ''}</option>)}</optgroup>}
                    </select>
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
