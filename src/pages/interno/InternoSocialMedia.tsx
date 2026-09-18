import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarraIndicadores, CORES } from "@/components/interno/BarraIndicadores";
import { RelatorioSocialMedia } from "@/components/interno/RelatorioSocialMedia";
import { baixarRelatorioPdf } from "@/lib/relatorioPdf";
import { toast } from "sonner";
import {
  Users, TrendingUp, Eye, UserCheck, Heart, BarChart3,
  ChevronDown, ChevronUp, MessageCircle, Bookmark, Play,
  ExternalLink, Flame, Clock, FileDown, Instagram, Loader2,
} from "lucide-react";

interface IGAccount {
  id: string;
  name: string;
  username: string;
  profile_picture_url: string;
  followers_count: number;
  media_count: number;
}

interface IGInsight {
  name: string;
  values: { value: number }[];
}

interface IGMedia {
  id: string;
  caption: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  permalink: string;
}

const KPI_CARDS = [
  { key: "followers", label: "Seguidores", icon: Users, color: "#FFE14D" },
  { key: "reach", label: "Alcance (30d)", icon: TrendingUp, color: "#22C55E" },
  { key: "impressions", label: "Impressões (30d)", icon: Eye, color: "#3B82F6" },
  { key: "profile_views", label: "Visitas ao Perfil (30d)", icon: UserCheck, color: "#A855F7" },
  { key: "likes", label: "Curtidas do mês", icon: Heart, color: "#EF4444" },
  { key: "accounts_engaged", label: "Contas Engajadas (30d)", icon: BarChart3, color: "#14B8A6" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "") + "k";
  return n.toLocaleString("pt-BR");
}

function PostCard({ post }: { post: IGMedia }) {
  const isVideo = post.media_type === "VIDEO";
  const thumb = post.thumbnail_url || post.media_url;
  const caption = post.caption || "";

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl overflow-hidden bg-[#191813] border border-white/5 hover:border-[#FFE14D]/30 transition-all"
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={thumb}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {isVideo && (
          <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
            <Play size={14} className="text-white fill-white" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="absolute bottom-2 right-2">
            <ExternalLink size={14} className="text-white/80" />
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-xs text-[#B8B2A6] line-clamp-2 min-h-[2rem]">
          {caption.slice(0, 120)}{caption.length > 120 ? "..." : ""}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-red-400">
            <Heart size={12} className="fill-red-400" /> {formatNumber(post.like_count)}
          </span>
          <span className="flex items-center gap-1 text-blue-400">
            <MessageCircle size={12} /> {post.comments_count}
          </span>
        </div>
        <p className="text-[10px] text-[#8F8A7C]">
          {new Date(post.timestamp).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
    </a>
  );
}

export default function InternoSocialMedia() {
  const [accounts, setAccounts] = useState<IGAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<IGAccount | null>(null);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [media, setMedia] = useState<IGMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [viralOpen, setViralOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [mediaLimit, setMediaLimit] = useState(50);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    const resp = await supabase.functions.invoke("instagram-api?action=accounts");
    const result = resp.data;
    if (result?.data) {
      const accs: IGAccount[] = result.data
        .filter((p: any) => p.instagram_business_account)
        .map((p: any) => ({
          id: p.instagram_business_account.id,
          name: p.instagram_business_account.name || p.name,
          username: p.instagram_business_account.username,
          profile_picture_url: p.instagram_business_account.profile_picture_url,
          followers_count: p.instagram_business_account.followers_count || 0,
          media_count: p.instagram_business_account.media_count || 0,
        }));
      setAccounts(accs);
      if (accs.length > 0) {
        setSelectedAccount(accs[0]);
      }
    }
    setLoading(false);
  };

  const fetchInsights = useCallback(async (igId: string) => {
    const resp = await supabase.functions.invoke(
      `instagram-api?action=insights&ig_id=${igId}&period=day&metrics=impressions,reach,profile_views,accounts_engaged`
    );
    const result = resp.data;
    const newKpis: Record<string, number> = {};
    if (result?.data) {
      result.data.forEach((insight: IGInsight) => {
        const vals = insight.values || [];
        const total = vals.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
        newKpis[insight.name] = total;
      });
    }
    return newKpis;
  }, []);

  const fetchMedia = useCallback(async (igId: string, limit: number) => {
    setLoadingMedia(true);
    const resp = await supabase.functions.invoke(
      `instagram-api?action=media&ig_id=${igId}&limit=${limit}`
    );
    const result = resp.data;
    if (result?.data) {
      setMedia(result.data);
    }
    setLoadingMedia(false);
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    const load = async () => {
      const insights = await fetchInsights(selectedAccount.id);
      const totalLikes = media.reduce((s, m) => s + m.like_count, 0);
      setKpis({
        followers: selectedAccount.followers_count,
        reach: insights.reach || 0,
        impressions: insights.impressions || 0,
        profile_views: insights.profile_views || 0,
        likes: totalLikes,
        accounts_engaged: insights.accounts_engaged || 0,
      });
    };
    load();
    fetchMedia(selectedAccount.id, mediaLimit);
  }, [selectedAccount, mediaLimit]);

  useEffect(() => {
    if (media.length > 0 && selectedAccount) {
      const totalLikes = media.reduce((s, m) => s + m.like_count, 0);
      setKpis((prev) => ({ ...prev, likes: totalLikes }));
    }
  }, [media]);

  const viralPosts = [...media]
    .sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count))
    .slice(0, 10);

  const recentPosts = [...media].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const totalComentarios = media.reduce((t, m) => t + (m.comments_count || 0), 0);
  const taxaEngajamento = (() => {
    const inter = media.reduce((t, m) => t + (m.like_count || 0) + (m.comments_count || 0), 0);
    const taxa = media.length && kpis.followers ? (inter / media.length / kpis.followers) * 100 : 0;
    return taxa ? `${taxa.toFixed(1).replace('.', ',')}%` : '—';
  })();

  const gerarPdf = async () => {
    if (!selectedAccount) return;
    setGerandoPdf(true);
    try {
      await baixarRelatorioPdf(
        <RelatorioSocialMedia
          usuario={selectedAccount.username}
          seguidores={kpis.followers || selectedAccount.followers_count}
          publicacoes={media.length}
          curtidas={kpis.likes || 0}
          comentarios={totalComentarios}
          engajamento={taxaEngajamento}
          posts={media.map((m) => ({ id: m.id, legenda: m.caption, data: m.timestamp, tipo: m.media_type, curtidas: m.like_count || 0, comentarios: m.comments_count || 0 }))}
        />,
        `relatorio-social-media-lagun`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar o PDF');
    } finally {
      setGerandoPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-[#FFE14D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 max-md:space-y-4 max-md:pb-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#FFE14D] max-md:hidden" />
          <h1 className="text-lg font-bold text-[#FFE14D] max-md:hidden">Social Media</h1>
          {selectedAccount && <span className="text-sm text-muted-foreground max-md:hidden">@{selectedAccount.username}</span>}
        </div>
        <button onClick={() => void gerarPdf()} disabled={gerandoPdf || loadingMedia || !selectedAccount}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#FFE14D] px-3.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,225,77,.45)] transition hover:bg-[#FFEC8A] disabled:opacity-50">
          {gerandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {gerandoPdf ? 'Gerando…' : 'Gerar PDF'}
        </button>
      </div>

      {/* Uma conta só (@lagunvix): o seletor de contas foi removido — o @ aparece
          no cabeçalho acima. */}

      {/* Indicadores — só o que a API devolve de fato. Alcance, impressões e
          visitas ao perfil vinham dos Insights, que respondem
          "(#10) Application does not have permission" e ficavam zerados. */}
      <BarraIndicadores
        titulo="Instagram conectado"
        subtitulo={selectedAccount ? `@${selectedAccount.username}` : 'carregando…'}
        carregando={!selectedAccount}
        avatar={selectedAccount?.profile_picture_url
          ? <img src={selectedAccount.profile_picture_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/15"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white/70"><Instagram size={18} /></span>}
        itens={[
          { label: 'Seguidores', valor: formatNumber(kpis.followers || 0), sub: 'conta profissional', cor: CORES.ouro, barra: 100 },
          { label: 'Publicações', valor: formatNumber(media.length), sub: 'carregadas no período', cor: CORES.branco, barra: 70, soWeb: true },
          { label: 'Curtidas', valor: formatNumber(kpis.likes || 0), sub: 'somadas nas publicações', cor: CORES.rosa, barra: 84 },
          { label: 'Comentários', valor: formatNumber(totalComentarios), sub: 'somados nas publicações', cor: CORES.azul, barra: 46 },
          { label: 'Engajamento', valor: taxaEngajamento, sub: 'média por publicação', cor: CORES.verde, barra: 58, soWeb: true },
        ]}
      />

      {/* Viral Posts */}
      <div className="rounded-xl border border-white/5 bg-[#191813]">
        <button
          onClick={() => setViralOpen(!viralOpen)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-orange-400" />
            <h2 className="text-sm font-bold text-white">Publicações Virais</h2>
            <span className="text-xs text-[#8F8A7C]">Top 10 por engajamento</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#FFE14D] font-medium">
              {viralPosts.length} posts
            </span>
            {viralOpen ? (
              <ChevronUp size={16} className="text-[#8F8A7C]" />
            ) : (
              <ChevronDown size={16} className="text-[#8F8A7C]" />
            )}
          </div>
        </button>
        {viralOpen && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {viralPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Posts */}
      <div className="rounded-xl border border-white/5 bg-[#191813]">
        <button
          onClick={() => setRecentOpen(!recentOpen)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">Publicações Recentes</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              onClick={(e) => e.stopPropagation()}
              value={mediaLimit}
              onChange={(e) => setMediaLimit(Number(e.target.value))}
              className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[#FFE14D] font-medium"
            >
              <option value={20}>20 posts</option>
              <option value={50}>50 posts</option>
              <option value={100}>100 posts</option>
              <option value={200}>200 posts</option>
              <option value={300}>300 posts</option>
            </select>
            {recentOpen ? (
              <ChevronUp size={16} className="text-[#8F8A7C]" />
            ) : (
              <ChevronDown size={16} className="text-[#8F8A7C]" />
            )}
          </div>
        </button>
        {recentOpen && (
          <div className="px-4 pb-4">
            {loadingMedia ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 border-2 border-[#FFE14D] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {recentPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
