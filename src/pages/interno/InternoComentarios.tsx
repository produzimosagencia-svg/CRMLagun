import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Heart, Instagram, Loader2, MessageCircle, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
}

interface InstagramComment {
  id: string;
  text: string;
  username?: string;
  from?: { id?: string; username?: string };
  user?: { id?: string; username?: string } | string;
  timestamp: string;
  like_count?: number;
}

async function callInstagram(action: string, params: Record<string, string> = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada. Entre novamente.');

  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || payload.error || 'Falha ao consultar o Instagram.');
  }
  return payload;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function commentAuthor(comment: InstagramComment) {
  if (comment.username) return comment.username;
  if (comment.from?.username) return comment.from.username;
  if (typeof comment.user === 'object' && comment.user?.username) return comment.user.username;
  if (typeof comment.user === 'string' && comment.user.trim()) return comment.user;
  return null;
}

export default function InternoComentarios() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [comments, setComments] = useState<Record<string, InstagramComment[]>>({});
  const [openMediaId, setOpenMediaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCommentsId, setLoadingCommentsId] = useState<string | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [commentsIndexed, setCommentsIndexed] = useState(false);
  const [search, setSearch] = useState('');

  const selectedAccount = accounts.find(account => account.id === selectedAccountId);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filteredMedia = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return media;
    return media.filter(post => (comments[post.id] || []).some(comment =>
      comment.text.toLocaleLowerCase('pt-BR').includes(term),
    ));
  }, [comments, media, search]);
  const matchingCommentsCount = useMemo(() => {
    if (!normalizedSearch) return 0;
    return Object.values(comments).reduce((total, postComments) => total + postComments.filter(comment =>
      comment.text.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
    ).length, 0);
  }, [comments, normalizedSearch]);

  async function loadAccounts() {
    setLoading(true);
    try {
      const result = await callInstagram('accounts');
      const nextAccounts: InstagramAccount[] = (result.data || [])
        .filter((page: { instagram_business_account?: InstagramAccount }) => page.instagram_business_account)
        .map((page: { instagram_business_account: InstagramAccount; name?: string }) => ({
          ...page.instagram_business_account,
          name: page.name || page.instagram_business_account.name,
        }));

      setAccounts(nextAccounts);
      setSelectedAccountId(current => current && nextAccounts.some(account => account.id === current)
        ? current
        : nextAccounts[0]?.id || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMedia(accountId: string) {
    if (!accountId) return;
    setLoading(true);
    setComments({});
    setCommentsIndexed(false);
    setOpenMediaId(null);
    try {
      const result = await callInstagram('media', { ig_id: accountId, limit: '50' });
      setMedia(result.data || []);
    } catch (error) {
      setMedia([]);
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as publicações.');
    } finally {
      setLoading(false);
    }
  }

  async function indexCommentsForSearch() {
    if (!selectedAccountId || commentsIndexed) return;
    setLoadingSearch(true);
    try {
      const posts = media.filter(post => (post.comments_count || 0) > 0);
      const indexed: Record<string, InstagramComment[]> = { ...comments };

      // Lotes pequenos evitam uma rajada de requisições à API da Meta.
      for (let index = 0; index < posts.length; index += 5) {
        const batch = posts.slice(index, index + 5);
        const results = await Promise.all(batch.map(async post => {
          if (indexed[post.id]) return [post.id, indexed[post.id]] as const;
          const result = await callInstagram('comments', {
            ig_id: selectedAccountId,
            media_id: post.id,
            limit: '100',
          });
          return [post.id, (result.data || []) as InstagramComment[]] as const;
        }));
        results.forEach(([postId, postComments]) => { indexed[postId] = postComments; });
      }

      setComments(indexed);
      setCommentsIndexed(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível pesquisar nos comentários.');
    } finally {
      setLoadingSearch(false);
    }
  }

  async function toggleComments(post: InstagramMedia) {
    if (openMediaId === post.id) {
      setOpenMediaId(null);
      return;
    }
    setOpenMediaId(post.id);
    if (comments[post.id]) return;

    setLoadingCommentsId(post.id);
    try {
      const result = await callInstagram('comments', {
        ig_id: selectedAccountId,
        media_id: post.id,
        limit: '100',
      });
      setComments(current => ({ ...current, [post.id]: result.data || [] }));
    } catch (error) {
      setOpenMediaId(null);
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os comentários.');
    } finally {
      setLoadingCommentsId(null);
    }
  }

  useEffect(() => { void loadAccounts(); }, []);
  useEffect(() => { if (selectedAccountId) void loadMedia(selectedAccountId); }, [selectedAccountId]);
  useEffect(() => {
    if (!normalizedSearch || commentsIndexed || loading || media.length === 0) return;
    const timer = window.setTimeout(() => { void indexCommentsForSearch(); }, 450);
    return () => window.clearTimeout(timer);
  }, [normalizedSearch, commentsIndexed, loading, media.length, selectedAccountId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="text-[#E8C766]" size={22} />
            <h1 className="text-xl font-bold text-foreground">Comentários</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe os comentários organizados por publicação do Instagram.</p>
        </div>
        <Button variant="outline" onClick={() => selectedAccountId ? void loadMedia(selectedAccountId) : void loadAccounts()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} size={15} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[240px_1fr]">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Conta do Instagram
          <select
            value={selectedAccountId}
            onChange={event => setSelectedAccountId(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
          >
            {accounts.map(account => <option key={account.id} value={account.id}>@{account.username}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Buscar palavra
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar palavra nos comentários…" className="pl-9 pr-10" />
            {loadingSearch && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#E8C766]" size={16} />}
          </div>
        </label>
      </div>

      {normalizedSearch && commentsIndexed && !loadingSearch && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E8C766]/25 bg-[#E8C766]/10 px-4 py-3 text-sm">
          <span className="font-bold text-[#E8C766]">{matchingCommentsCount.toLocaleString('pt-BR')}</span>
          <span className="text-foreground/85">{matchingCommentsCount === 1 ? 'comentário encontrado' : 'comentários encontrados'} com “{search.trim()}” em {filteredMedia.length} {filteredMedia.length === 1 ? 'publicação' : 'publicações'}.</span>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border bg-card"><Loader2 className="animate-spin text-[#E8C766]" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border bg-card p-14 text-center text-sm text-muted-foreground">Nenhuma conta do Instagram conectada.</div>
      ) : loadingSearch ? (
        <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground"><Loader2 className="animate-spin text-[#E8C766]" size={18} /> Pesquisando nos comentários…</div>
      ) : filteredMedia.length === 0 ? (
        <div className="rounded-xl border bg-card p-14 text-center text-sm text-muted-foreground">{normalizedSearch ? `Nenhum comentário contém “${search.trim()}”.` : 'Nenhuma publicação encontrada.'}</div>
      ) : (
        <div className="space-y-3">
          {filteredMedia.map(post => {
            const postComments = comments[post.id];
            const isSearching = normalizedSearch.length > 0;
            const matchingComments = isSearching
              ? (postComments || []).filter(comment => comment.text.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
              : postComments;
            const isOpen = isSearching || openMediaId === post.id;
            const preview = post.thumbnail_url || post.media_url;
            const postMatches = matchingComments?.length || 0;
            return (
              <article key={post.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-col gap-4 p-4 sm:flex-row">
                  <div className="h-32 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-28">
                    {preview ? <img src={preview} alt="Publicação" className="h-full w-full object-cover" loading="lazy" /> : <Instagram className="m-auto h-full text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>@{selectedAccount?.username}</span>
                      <span>{formatDate(post.timestamp)}</span>
                      <span className="flex items-center gap-1"><Heart size={13} /> {post.like_count || 0}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={13} /> {post.comments_count || 0}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-foreground">{post.caption || 'Publicação sem legenda.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isSearching && <span className="inline-flex h-8 items-center rounded-md bg-[#E8C766]/10 px-3 text-xs font-semibold text-[#E8C766]">{postMatches} {postMatches === 1 ? 'comentário encontrado' : 'comentários encontrados'}</span>}
                      {!isSearching && <Button size="sm" variant={isOpen ? 'secondary' : 'outline'} onClick={() => void toggleComments(post)}>
                        {loadingCommentsId === post.id ? <Loader2 className="animate-spin" size={14} /> : <MessageCircle size={14} />}
                        {isOpen ? 'Ocultar comentários' : `Ver comentários (${post.comments_count || 0})`}
                      </Button>}
                      {post.permalink && <Button size="sm" variant="ghost" asChild><a href={post.permalink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir publicação</a></Button>}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {loadingCommentsId === post.id ? (
                      <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Carregando comentários…</div>
                    ) : !matchingComments?.length ? (
                      <p className="py-5 text-sm text-muted-foreground">Esta publicação ainda não tem comentários.</p>
                    ) : (
                      <div className="divide-y">
                        {matchingComments.map(comment => (
                          <div key={comment.id} className="py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {commentAuthor(comment) ? (
                                <a href={`https://instagram.com/${commentAuthor(comment)}`} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:text-pink-400">@{commentAuthor(comment)}</a>
                              ) : (
                                <span className="text-sm font-semibold text-muted-foreground">Autor não disponibilizado pelo Instagram</span>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/25 bg-pink-500/10 px-2 py-1 text-[11px] font-semibold text-pink-400" title="Curtidas neste comentário">
                                  <Heart size={12} className="fill-current" />
                                  {(comment.like_count || 0).toLocaleString('pt-BR')} {comment.like_count === 1 ? 'curtida' : 'curtidas'}
                                </span>
                                <span className="text-[11px] text-muted-foreground">{formatDate(comment.timestamp)}</span>
                              </div>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{comment.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
