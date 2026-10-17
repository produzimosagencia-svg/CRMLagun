import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Heart, Instagram, Loader2, MessageCircle, Play, RefreshCw, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  autorDoComentario, comentariosInstagram, contasInstagram, publicacoesInstagram,
  nf, dataCurta, dataHora, type ComentarioInstagram, type ContaInstagram, type PublicacaoInstagram,
} from '@/lib/instagramApi';
import { lembrado, lembrar } from '@/app-desktop/memoria';

/**
 * Comentários no APP: duas colunas, como um leitor de mensagens.
 * À esquerda as publicações (foto, legenda, números); à direita os comentários
 * da publicação escolhida. A busca por palavra indexa os comentários de todas
 * as publicações (em lotes, para não bombardear a Meta) e filtra as duas colunas.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export default function Comentarios() {
  const guardado = lembrado<{ conta: ContaInstagram | null; posts: PublicacaoInstagram[]; comentarios: Record<string, ComentarioInstagram[]> }>('comentarios');
  const [conta, setConta] = useState<ContaInstagram | null>(guardado?.conta ?? null);
  const [posts, setPosts] = useState<PublicacaoInstagram[]>(guardado?.posts ?? []);
  const [comentarios, setComentarios] = useState<Record<string, ComentarioInstagram[]>>(guardado?.comentarios ?? {});
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!guardado);
  const [carregandoComentarios, setCarregandoComentarios] = useState<string | null>(null);
  const [indexando, setIndexando] = useState(false);
  const [indexado, setIndexado] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => { lembrar('comentarios', { conta, posts, comentarios }); }, [conta, posts, comentarios]);

  const termo = busca.trim().toLocaleLowerCase('pt-BR');

  async function carregar() {
    setCarregando((c) => c && posts.length === 0);
    try {
      const contas = await contasInstagram();
      const c = contas[0] ?? null;
      setConta(c);
      if (c) {
        setPosts(await publicacoesInstagram(c.id, 50));
        setComentarios({}); setIndexado(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o Instagram.');
    } finally { setCarregando(false); }
  }
  useEffect(() => { void carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(p: PublicacaoInstagram) {
    setEscolhido(p.id);
    if (comentarios[p.id] || !conta) return;
    setCarregandoComentarios(p.id);
    try {
      const lista = await comentariosInstagram(conta.id, p.id);
      setComentarios((c) => ({ ...c, [p.id]: lista }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar os comentários.');
    } finally { setCarregandoComentarios(null); }
  }

  // Busca: indexa os comentários de todas as publicações que têm comentário, em lotes de 5.
  useEffect(() => {
    if (!termo || indexado || indexando || carregando || !conta || posts.length === 0) return;
    const t = window.setTimeout(async () => {
      setIndexando(true);
      try {
        const alvo = posts.filter((p) => (p.comments_count ?? 0) > 0);
        const acumulado: Record<string, ComentarioInstagram[]> = { ...comentarios };
        for (let i = 0; i < alvo.length; i += 5) {
          const lote = alvo.slice(i, i + 5);
          const res = await Promise.all(lote.map(async (p) => [p.id, acumulado[p.id] ?? await comentariosInstagram(conta.id, p.id)] as const));
          res.forEach(([id, lista]) => { acumulado[id] = lista; });
        }
        setComentarios(acumulado); setIndexado(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível pesquisar nos comentários.');
      } finally { setIndexando(false); }
    }, 450);
    return () => window.clearTimeout(t);
  }, [termo, indexado, indexando, carregando, conta, posts, comentarios]);

  const bate = (c: ComentarioInstagram) => c.text.toLocaleLowerCase('pt-BR').includes(termo);
  const postsVisiveis = useMemo(() => {
    const ordenados = [...posts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (!termo) return ordenados;
    return ordenados.filter((p) => (comentarios[p.id] ?? []).some(bate));
  }, [posts, comentarios, termo]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalBusca = useMemo(() => termo ? Object.values(comentarios).reduce((t, l) => t + l.filter(bate).length, 0) : 0, [comentarios, termo]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = posts.find((p) => p.id === escolhido) ?? null;
  const lista = post ? (comentarios[post.id] ?? []).filter((c) => !termo || bate(c)) : [];
  const totalComentarios = posts.reduce((t, p) => t + (p.comments_count ?? 0), 0);

  return (
    <div className="grid h-[calc(100vh-190px)] min-h-[520px] grid-cols-12 gap-4">
      {/* ── Publicações ───────────────────────────────────────────────── */}
      <section className="app-superficie col-span-5 flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-white/[0.07] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="app-eyebrow">{conta ? `@${conta.username}` : 'Instagram'}</p>
              <p className="mt-0.5 text-[13px] text-white/60"><span className="app-titulo text-[20px] text-white">{nf.format(posts.length)}</span> publicações · <span className="app-titulo text-[20px] text-white">{nf.format(totalComentarios)}</span> comentários</p>
            </div>
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="app-aba h-8 px-3 text-[11px]"><RefreshCw size={12} className={carregando ? 'animate-spin' : ''} /> Atualizar</button>
          </div>
          <label className="relative mt-3 block">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar palavra nos comentários…" className="h-10 w-full rounded-full border border-white/10 bg-black/40 pl-10 pr-10 text-[13px] text-white placeholder:text-white/30" />
            {indexando && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-[#FFE14D]" />}
          </label>
          {termo && indexado && !indexando && (
            <p className="mt-2 text-[11.5px] text-white/50"><span className="font-semibold text-[#FFE14D]">{nf.format(totalBusca)}</span> {totalBusca === 1 ? 'comentário' : 'comentários'} com “{busca.trim()}” em {postsVisiveis.length} {postsVisiveis.length === 1 ? 'publicação' : 'publicações'}.</p>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {carregando && !posts.length ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="app-esqueleto m-1 h-[84px]" />) : postsVisiveis.length === 0 ? (
            <li className="py-12 text-center text-[13px] text-white/40">{termo ? (indexando ? 'Pesquisando nos comentários…' : `Nenhum comentário contém “${busca.trim()}”.`) : 'Nenhuma publicação encontrada.'}</li>
          ) : postsVisiveis.map((p) => {
            const ativo = p.id === escolhido;
            const foto = p.thumbnail_url || p.media_url;
            const achados = termo ? (comentarios[p.id] ?? []).filter(bate).length : 0;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => void abrir(p)} className={`flex w-full items-center gap-3 rounded-[14px] p-2 text-left transition-colors ${ativo ? 'bg-[#FFE14D]/[0.1] ring-1 ring-[#FFE14D]/40' : 'hover:bg-white/[0.035]'}`}>
                  <span className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[12px] bg-white/[0.05] ring-1 ring-white/10">
                    {foto ? <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Instagram size={18} className="m-auto h-full text-white/30" />}
                    {p.media_type === 'VIDEO' && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/60"><Play size={8} className="fill-white text-white" /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[12.5px] leading-snug text-white/80">{p.caption || <span className="text-white/35">Publicação sem legenda.</span>}</span>
                    <span className="mt-1.5 flex items-center gap-3 text-[11px] text-white/40">
                      <span>{dataCurta(p.timestamp)}</span>
                      <span className="flex items-center gap-1"><Heart size={10} className="fill-[#F9A8D4] text-[#F9A8D4]" />{nf.format(p.like_count ?? 0)}</span>
                      <span className={`flex items-center gap-1 ${ativo ? 'text-[#FFE14D]' : ''}`}><MessageCircle size={10} />{termo ? `${achados} de ${nf.format(p.comments_count ?? 0)}` : nf.format(p.comments_count ?? 0)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Comentários da publicação ─────────────────────────────────── */}
      <section className="app-superficie col-span-7 flex min-h-0 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {!post ? (
            <motion.div key="vazio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <MessageCircle size={40} strokeWidth={1.2} className="text-white/20" />
              <p className="app-titulo text-[22px] text-white/50">Escolha uma publicação</p>
              <p className="max-w-xs text-[12.5px] text-white/35">Os comentários aparecem aqui. Use a busca para achar uma palavra em todas as publicações.</p>
            </motion.div>
          ) : (
            <motion.div key={post.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }} transition={{ duration: 0.35, ease: EASE }} className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start gap-4 border-b border-white/[0.07] p-4">
                <span className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[14px] bg-white/[0.05] ring-1 ring-white/10">
                  {(post.thumbnail_url || post.media_url) && <img src={post.thumbnail_url || post.media_url} alt="" className="h-full w-full object-cover" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="app-eyebrow">{dataHora(post.timestamp)}</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-snug text-white/80">{post.caption || 'Publicação sem legenda.'}</p>
                  <div className="mt-2 flex items-center gap-4 text-[12px] text-white/50">
                    <span className="flex items-center gap-1"><Heart size={12} className="fill-[#F9A8D4] text-[#F9A8D4]" /> {nf.format(post.like_count ?? 0)}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={12} className="text-[#8FB4FF]" /> {nf.format(post.comments_count ?? 0)}</span>
                    {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#FFEC8A] hover:underline">Abrir no Instagram <ArrowUpRight size={12} /></a>}
                  </div>
                </div>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-4">
                {carregandoComentarios === post.id ? Array.from({ length: 4 }).map((_, i) => <li key={i} className="app-esqueleto my-2 h-[64px]" />) : lista.length === 0 ? (
                  <li className="py-12 text-center text-[13px] text-white/40">{termo ? `Nenhum comentário desta publicação contém “${busca.trim()}”.` : 'Esta publicação ainda não tem comentários.'}</li>
                ) : lista.map((c) => {
                  const autor = autorDoComentario(c);
                  const hue = [...(autor || c.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
                  return (
                    <li key={c.id} className="flex items-start gap-3 border-b border-white/[0.06] py-3 last:border-0">
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-1 ring-white/10" style={{ background: `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)` }}>
                        {(autor || '?').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          {autor
                            ? <a href={`https://instagram.com/${autor}`} target="_blank" rel="noreferrer" className="truncate text-[13px] font-semibold text-white hover:text-[#FFEC8A]">@{autor}</a>
                            : <span className="text-[13px] font-semibold text-white/40">Autor não informado pelo Instagram</span>}
                          <span className="flex shrink-0 items-center gap-3 text-[10.5px] text-white/35">
                            {(c.like_count ?? 0) > 0 && <span className="flex items-center gap-1 text-[#F9A8D4]"><Heart size={10} className="fill-current" />{nf.format(c.like_count ?? 0)}</span>}
                            {dataHora(c.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-white/75" data-selecionavel>{c.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
