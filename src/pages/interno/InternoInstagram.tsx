import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BarChart3, Image, RefreshCw, Heart, Eye, Users, ArrowLeft, Calendar, Send, ImageIcon, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface IGAccount {
  id: string;
  name: string;
  username: string;
  profile_picture_url: string;
  followers_count: number;
  media_count: number;
}

interface IGMedia {
  id: string;
  caption: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  permalink: string;
}

const ALLOWED_USERNAMES = ['lagunvix', 'triade.ent', 'maestria.rap', 'boomrapfestival', 'vitoriafestival'];
const USERNAME_ORDER: Record<string, number> = { 'lagunvix': 0, 'triade.ent': 1, 'maestria.rap': 2, 'boomrapfestival': 3, 'vitoriafestival': 4 };

async function callInstagram(action: string, params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const session = (await supabase.auth.getSession()).data.session;
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${queryStr}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );
  return resp.json();
}

async function postInstagram(action: string, body: Record<string, unknown>) {
  const session = (await supabase.auth.getSession()).data.session;
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?action=${action}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  return resp.json();
}

type SubView = 'list' | 'analytics' | 'schedule';

export default function InternoInstagram() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<IGAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<SubView>('list');
  const [selectedAccount, setSelectedAccount] = useState<IGAccount | null>(null);

  // Analytics state
  const [insights, setInsights] = useState<any>(null);
  const [media, setMedia] = useState<IGMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Schedule state
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [scheduleImageUrl, setScheduleImageUrl] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    setLoading(true);
    try {
      const data = await callInstagram('accounts');
      if (data.error) {
        toast.error('Erro ao carregar contas: ' + (data.error?.message || data.error));
        setLoading(false);
        return;
      }
      const igAccounts: IGAccount[] = (data.data || [])
        .filter((p: any) => p.instagram_business_account)
        .map((p: any) => ({ ...p.instagram_business_account, name: p.name }))
        .filter((acc: IGAccount) => ALLOWED_USERNAMES.includes(acc.username))
        .sort((a: IGAccount, b: IGAccount) => (USERNAME_ORDER[a.username] ?? 99) - (USERNAME_ORDER[b.username] ?? 99));
      setAccounts(igAccounts);
    } catch {
      toast.error('Erro de conexão com Instagram');
    } finally {
      setLoading(false);
    }
  }

  async function openAnalytics(acc: IGAccount) {
    setSelectedAccount(acc);
    setSubView('analytics');
    setLoadingMedia(true);
    try {
      const [mediaData, insightsData] = await Promise.all([
        callInstagram('media', { ig_id: acc.id, limit: '30' }),
        callInstagram('insights', { ig_id: acc.id, period: 'day', metrics: 'impressions,reach,profile_views' }),
      ]);
      setMedia(mediaData.data || []);
      setInsights(insightsData.data || []);
    } catch {
      toast.error('Erro ao carregar analytics');
    } finally {
      setLoadingMedia(false);
    }
  }

  function openSchedule(acc: IGAccount) {
    setSelectedAccount(acc);
    setSubView('schedule');
    setScheduleCaption('');
    setScheduleImageUrl('');
  }

  async function handleSchedulePost() {
    if (!scheduleImageUrl.trim() || !selectedAccount) {
      toast.error('URL da imagem é obrigatória');
      return;
    }
    setScheduling(true);
    try {
      const result = await postInstagram('publish', {
        ig_id: selectedAccount.id,
        image_url: scheduleImageUrl.trim(),
        caption: scheduleCaption,
      });
      if (result.error) {
        toast.error('Erro ao publicar: ' + (result.error?.message || result.error));
      } else {
        toast.success('Post publicado com sucesso!');
        setScheduleCaption('');
        setScheduleImageUrl('');
        setSubView('list');
      }
    } catch {
      toast.error('Erro ao publicar post');
    } finally {
      setScheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-full bg-pink-50 mb-4">
          <Image size={32} className="text-pink-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Nenhuma conta encontrada</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          Verifique se o token do Meta tem permissões de Instagram Business.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={loadAccounts}>
          <RefreshCw size={14} className="mr-1" /> Tentar novamente
        </Button>
      </div>
    );
  }

  // Account list view
  if (subView === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/interno')}>
              <ArrowLeft size={16} className="mr-1" /> Home
            </Button>
            <h2 className="text-sm font-semibold text-gray-900">Instagram</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={loadAccounts}>
            <RefreshCw size={14} />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="p-5 flex items-center gap-4">
                {acc.profile_picture_url && (
                  <img src={acc.profile_picture_url} alt={acc.username} className="w-14 h-14 rounded-full border-2 border-pink-100" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">@{acc.username}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {acc.followers_count?.toLocaleString('pt-BR')} seguidores · {acc.media_count} posts
                  </p>
                </div>
              </div>
              <div className="border-t border-gray-50 grid grid-cols-2">
                <button
                  onClick={() => openAnalytics(acc)}
                  className="flex items-center justify-center gap-2 py-3.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-pink-600 transition-colors duration-150"
                >
                  <BarChart3 size={14} />
                  Analytics
                </button>
                <button
                  onClick={() => openSchedule(acc)}
                  className="flex items-center justify-center gap-2 py-3.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-pink-600 transition-colors duration-150 border-l border-gray-50"
                >
                  <Send size={14} />
                  Programar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Analytics view
  if (subView === 'analytics' && selectedAccount) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSubView('list')}>
            <ArrowLeft size={16} className="mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-3">
            {selectedAccount.profile_picture_url && (
              <img src={selectedAccount.profile_picture_url} alt={selectedAccount.username} className="w-8 h-8 rounded-full border border-pink-100" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-gray-900">@{selectedAccount.username}</h2>
              <p className="text-[11px] text-gray-400">{selectedAccount.followers_count?.toLocaleString('pt-BR')} seguidores</p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        {insights && insights.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {insights.map((metric: any) => (
              <div key={metric.name} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {metric.name === 'impressions' && <Eye size={16} className="text-blue-500" />}
                  {metric.name === 'reach' && <Users size={16} className="text-green-500" />}
                  {metric.name === 'profile_views' && <Eye size={16} className="text-purple-500" />}
                  <p className="text-xs text-gray-400 capitalize">{metric.title || metric.name}</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {metric.values?.[metric.values.length - 1]?.value?.toLocaleString('pt-BR') || '—'}
                </p>
                <p className="text-[10px] text-gray-300 mt-1">Último período disponível</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <BarChart3 size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Analytics indisponível para esta conta.</p>
          </div>
        )}

        {/* Posts Grid */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-3">Últimos Posts</h3>
          {loadingMedia ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {media.map(post => (
                <a
                  key={post.id}
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100"
                >
                  <img
                    src={post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url}
                    alt={post.caption?.slice(0, 50) || 'Post'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-3 text-white text-sm">
                      <span className="flex items-center gap-1"><Heart size={14} /> {post.like_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={14} /> {post.comments_count}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Schedule view
  if (subView === 'schedule' && selectedAccount) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSubView('list')}>
            <ArrowLeft size={16} className="mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-3">
            {selectedAccount.profile_picture_url && (
              <img src={selectedAccount.profile_picture_url} alt={selectedAccount.username} className="w-8 h-8 rounded-full border border-pink-100" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Programar Post — @{selectedAccount.username}</h2>
            </div>
          </div>
        </div>

        <div className="max-w-lg bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">URL da Imagem</label>
            <Input
              value={scheduleImageUrl}
              onChange={e => setScheduleImageUrl(e.target.value)}
              placeholder="https://exemplo.com/imagem.jpg"
              className="rounded-xl border-gray-200"
            />
            <p className="text-[10px] text-gray-400 mt-1">A imagem precisa estar hospedada em uma URL pública acessível.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Legenda</label>
            <Textarea
              value={scheduleCaption}
              onChange={e => setScheduleCaption(e.target.value)}
              placeholder="Escreva a legenda do post..."
              rows={5}
              className="resize-none rounded-xl border-gray-200"
            />
          </div>

          {scheduleImageUrl && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Pré-visualização</p>
              <div className="w-full max-w-[300px] aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={scheduleImageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            </div>
          )}

          <Button
            onClick={handleSchedulePost}
            disabled={scheduling || !scheduleImageUrl.trim()}
            className="bg-pink-600 hover:bg-pink-700 text-white rounded-full px-6"
          >
            {scheduling ? 'Publicando...' : 'Publicar Agora'}
          </Button>
          <p className="text-[10px] text-gray-400">Reels e Stories não são suportados pela API do Meta. Apenas imagens e carrosséis.</p>
        </div>
      </div>
    );
  }

  return null;
}
