import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RotateCcw, Trophy, Eye, MousePointerClick, DollarSign, TrendingUp, ImageOff, Send, Trash2, Video, Image as ImageIcon, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface AdCreative {
  ad_name: string;
  ad_id: string;
  campaign_name: string;
  campaign_id: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type?: 'video' | 'static';
  video_url?: string | null;
  video_embed_url?: string | null;
}

interface Comment {
  id: string;
  ad_id: string;
  comment: string;
  created_by: string | null;
  created_at: string;
}

const DATE_OPTIONS = [
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_14d', label: 'Últimos 14 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'last_90d', label: 'Últimos 90 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
];

const EVENT_KEYWORDS: Record<string, string[]> = {
  'Maestria': ['maestria'],
  'Fantástico Mundo do Lukão': ['fantastico', 'fantástico', 'lukao', 'lukão', 'fml'],
  'Isso É Trap': ['trap', 'isso e trap', 'isso é trap'],
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'video', label: 'Vídeo' },
  { value: 'static', label: 'Estático' },
];

const EVENT_OPTIONS = [
  { value: 'all', label: 'Todos os eventos' },
  { value: 'Maestria', label: 'Maestria' },
  { value: 'Fantástico Mundo do Lukão', label: 'Fantástico Mundo do Lukão' },
  { value: 'Isso É Trap', label: 'Isso É Trap' },
];

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function detectEvent(campaignName: string, adName: string): string {
  const text = `${campaignName} ${adName}`.toLowerCase();
  for (const [event, keywords] of Object.entries(EVENT_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return event;
  }
  return 'Outro';
}

export default function InternoCriativosCampeoes() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; account_id: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');

  // Modal
  const [selectedCreative, setSelectedCreative] = useState<any | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const res = await supabase.functions.invoke('meta-ads-api?action=accounts', { method: 'GET' });
      if (res.data?.data) {
        setAccounts(res.data.data);
        // Auto-select first account (Tríade)
        if (res.data.data.length > 0) {
          setSelectedAccount(res.data.data[0].account_id);
        }
      }
    };
    fetchAccounts();
  }, []);

  const fetchCreatives = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError('');
    try {
      const res = await supabase.functions.invoke(
        `meta-ads-api?action=ad_creatives&account_id=${selectedAccount}&date_preset=${datePreset}`,
        { method: 'GET' }
      );
      if (res.data?.error) {
        setError(res.data.error.message || res.data.error);
      } else if (res.data?.data) {
        setCreatives(res.data.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccount) fetchCreatives();
  }, [selectedAccount, datePreset]);

  const rankedCreatives = useMemo(() => {
    return [...creatives]
      .map((c) => {
        const purchases = Number(c.actions?.find(a => a.action_type === 'purchase')?.value || 0);
        const purchaseValue = Number(c.action_values?.find(a => a.action_type === 'purchase')?.value || 0);
        const spend = Number(c.spend || 0);
        const roas = spend > 0 ? purchaseValue / spend : 0;
        const impressions = Number(c.impressions || 0);
        const clicks = Number(c.clicks || 0);
        const ctr = Number(c.ctr || 0);
        const event = detectEvent(c.campaign_name, c.ad_name);
        const creative_type = c.creative_type || 'static';
        return { ...c, purchases, purchaseValue, spend, roas, impressions, clicks, ctr, event, creative_type };
      })
      .filter(c => c.spend > 0)
      .filter(c => typeFilter === 'all' || c.creative_type === typeFilter)
      .sort((a, b) => {
        if (b.purchases !== a.purchases) return b.purchases - a.purchases;
        if (b.roas !== a.roas) return b.roas - a.roas;
        return b.spend - a.spend;
      });
  }, [creatives, typeFilter]);

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="text-lg">🥇</span>;
    if (index === 1) return <span className="text-lg">🥈</span>;
    if (index === 2) return <span className="text-lg">🥉</span>;
    return <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>;
  };

  // Comments
  const fetchComments = async (adId: string) => {
    setLoadingComments(true);
    const { data, error } = await supabase
      .from('ad_creative_comments')
      .select('*')
      .eq('ad_id', adId)
      .order('created_at', { ascending: true });
    if (data) setComments(data);
    setLoadingComments(false);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedCreative) return;
    setSubmittingComment(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('ad_creative_comments').insert({
      ad_id: selectedCreative.ad_id,
      comment: newComment.trim(),
      created_by: user?.id || null,
    });
    if (error) {
      toast.error('Erro ao salvar comentário');
    } else {
      setNewComment('');
      fetchComments(selectedCreative.ad_id);
    }
    setSubmittingComment(false);
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from('ad_creative_comments').delete().eq('id', commentId);
    if (selectedCreative) fetchComments(selectedCreative.ad_id);
  };

  const openCreativeModal = (creative: any) => {
    setSelectedCreative(creative);
    setNewComment('');
    fetchComments(creative.ad_id);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Trophy size={22} className="text-amber-500" />
            Criativos Campeões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ranking dos criativos que mais performaram
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-[200px] h-9 text-xs">
              <SelectValue placeholder="Selecionar conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <div className="flex items-center gap-1.5">
                {typeFilter === 'video' ? <Video size={12} /> : typeFilter === 'static' ? <ImageIcon size={12} /> : <Filter size={12} />}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={fetchCreatives} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && creatives.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && rankedCreatives.length === 0 && !error && (
        <div className="text-center py-20 text-muted-foreground">
          Nenhum criativo encontrado para os filtros selecionados.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rankedCreatives.map((c, idx) => (
          <div
            key={c.ad_id}
            onClick={() => openCreativeModal(c)}
            className={`relative rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-lg cursor-pointer ${
              idx < 3 ? 'border-amber-300 dark:border-amber-700 shadow-sm' : 'border-border'
            }`}
          >
            {/* Thumbnail */}
            <div className="aspect-video bg-muted flex items-center justify-center relative">
              {c.thumbnail_url || c.image_url ? (
                <img
                  src={c.thumbnail_url || c.image_url || ''}
                  alt={c.ad_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`flex flex-col items-center justify-center text-muted-foreground ${c.thumbnail_url || c.image_url ? 'hidden' : ''}`}>
                <ImageOff size={32} />
                <span className="text-xs mt-1">Sem preview</span>
              </div>
              {/* Rank badge */}
              <div className="absolute top-2 left-2 bg-card rounded-full h-8 w-8 flex items-center justify-center shadow-md">
                {getRankBadge(idx)}
              </div>
              {/* Type badge */}
              <div className="absolute top-2 right-2 bg-card/90 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1 shadow-sm">
                {c.creative_type === 'video' ? <Video size={10} /> : <ImageIcon size={10} />}
                <span className="text-[10px] font-medium">{c.creative_type === 'video' ? 'Vídeo' : 'Estático'}</span>
              </div>
            </div>

            {/* Info */}
            <div className="p-4">
              <p className="text-sm font-semibold text-foreground truncate" title={c.ad_name}>
                {c.ad_name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {c.event}
                </span>
                <p className="text-[11px] text-muted-foreground truncate" title={c.campaign_name}>
                  {c.campaign_name}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                <div className="flex items-center gap-1.5">
                  <DollarSign size={12} className="text-green-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Gasto</p>
                    <p className="text-xs font-semibold text-foreground">{fmtBRL(c.spend)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-blue-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">ROAS</p>
                    <p className="text-xs font-semibold text-foreground">{fmt(c.roas)}x</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye size={12} className="text-purple-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Impressões</p>
                    <p className="text-xs font-semibold text-foreground">{fmt(c.impressions)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <MousePointerClick size={12} className="text-pink-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Cliques</p>
                    <p className="text-xs font-semibold text-foreground">{fmt(c.clicks)}</p>
                  </div>
                </div>
              </div>

              {c.purchases > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">🛒 {c.purchases} vendas</span>
                  <span className="text-xs font-bold text-green-600 dark:text-green-400">{fmtBRL(c.purchaseValue)} faturado</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Creative Detail Modal */}
      <Dialog open={!!selectedCreative} onOpenChange={(open) => !open && setSelectedCreative(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          {selectedCreative && (
            <>
              {/* Full media */}
              <div className="bg-black flex items-center justify-center min-h-[300px] max-h-[500px]">
                {selectedCreative.creative_type === 'video' && selectedCreative.video_url ? (
                  <video
                    src={selectedCreative.video_url}
                    controls
                    autoPlay
                    className="max-w-full max-h-[500px] object-contain"
                    poster={selectedCreative.thumbnail_url || undefined}
                  />
                ) : selectedCreative.creative_type === 'video' && selectedCreative.video_embed_url ? (
                  <iframe
                    src={selectedCreative.video_embed_url}
                    className="w-full h-[500px]"
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                    style={{ border: 'none' }}
                  />
                ) : selectedCreative.image_url || selectedCreative.thumbnail_url ? (
                  <img
                    src={selectedCreative.image_url || selectedCreative.thumbnail_url}
                    alt={selectedCreative.ad_name}
                    className="max-w-full max-h-[500px] object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center text-gray-500 py-20">
                    <ImageOff size={48} />
                    <span className="mt-2">Sem preview disponível</span>
                  </div>
                )}
              </div>

              <div className="p-5">
                {/* Header like Instagram */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground text-base truncate">{selectedCreative.ad_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {selectedCreative.event}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {selectedCreative.creative_type === 'video' ? '🎬 Vídeo' : '🖼️ Estático'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{selectedCreative.campaign_name}</p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Gasto</p>
                    <p className="text-sm font-bold text-foreground">{fmtBRL(selectedCreative.spend)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">ROAS</p>
                    <p className="text-sm font-bold text-foreground">{fmt(selectedCreative.roas)}x</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Vendas</p>
                    <p className="text-sm font-bold text-foreground">{selectedCreative.purchases}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Impressões</p>
                    <p className="text-sm font-bold text-foreground">{fmt(selectedCreative.impressions)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Cliques</p>
                    <p className="text-sm font-bold text-foreground">{fmt(selectedCreative.clicks)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Faturado</p>
                    <p className="text-sm font-bold text-green-600">{fmtBRL(selectedCreative.purchaseValue)}</p>
                  </div>
                </div>

                {/* Comments section */}
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Observações</h4>
                  
                  {loadingComments ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhuma observação ainda.</p>
                  ) : (
                    <div className="space-y-3 mb-4 max-h-[200px] overflow-y-auto">
                      {comments.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-2 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{c.comment}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => deleteComment(c.id)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <Textarea
                      placeholder="Escreva uma observação..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[60px] text-sm resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitComment();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={submitComment}
                      disabled={!newComment.trim() || submittingComment}
                      className="h-10 w-10 shrink-0"
                    >
                      {submittingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
