import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Instagram, Loader2, Trophy, Medal, Star, Crown, ExternalLink, Film, Image, Radio } from 'lucide-react';

type Level = 'bronze' | 'prata' | 'ouro' | 'diamante';

const LEVEL = {
  bronze:   { label: 'Bronze',   color: '#b45309', bg: 'rgba(180,83,9,0.15)',   border: 'rgba(180,83,9,0.3)',   next: 300,  icon: '🥉' },
  prata:    { label: 'Prata',    color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', next: 600,  icon: '🥈' },
  ouro:     { label: 'Ouro',     color: '#eab308', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.3)',   next: 900,  icon: '🥇' },
  diamante: { label: 'Diamante', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.3)', next: null, icon: '💎' },
};

const MEDIA_LABELS: Record<string, { label: string; icon: any }> = {
  VIDEO:          { label: 'Reel',     icon: Film },
  IMAGE:          { label: 'Post',     icon: Image },
  CAROUSEL_ALBUM: { label: 'Carrossel', icon: Image },
  STORY:          { label: 'Story',    icon: Radio },
};

interface Detection {
  id: string;
  ig_media_id: string;
  media_type: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  posted_at: string | null;
}

interface PortalData {
  influencer: {
    id: string;
    full_name: string;
    score: number;
    level: Level;
    score_updated_at: string | null;
  };
  ig: {
    username: string;
    followers_count: number;
    profile_picture_url: string | null;
  } | null;
  detections: Detection[];
  rank: number;
  total: number;
}

function calcScore(d: Detection): number {
  const creation = d.media_type === 'VIDEO' ? 30 : d.media_type === 'STORY' ? 10 : 20;
  let reach = 0;
  if (d.media_type === 'VIDEO') {
    if (d.reach >= 50000) reach = 100; else if (d.reach >= 20000) reach = 60; else if (d.reach >= 5000) reach = 30; else reach = 10;
  } else if (d.media_type === 'STORY') {
    if (d.reach >= 5000) reach = 30; else if (d.reach >= 2000) reach = 18; else if (d.reach >= 500) reach = 8; else reach = 2;
  } else {
    if (d.reach >= 20000) reach = 60; else if (d.reach >= 8000) reach = 35; else if (d.reach >= 2000) reach = 15; else reach = 5;
  }
  const eng = d.saves * 0.5 + d.shares * 0.5 + d.comments * 0.2 + d.likes * 0.05;
  return creation + reach + eng;
}

export default function InfluenciadorPortal() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('Link inválido.'); setLoading(false); return; }
    load();
  }, [token]);

  async function load() {
    setLoading(true);

    const { data: inf } = await supabase
      .from('influencers')
      .select('id, full_name, score, level, score_updated_at')
      .eq('invite_token', token)
      .maybeSingle();

    if (!inf) { setError('Link inválido ou expirado.'); setLoading(false); return; }

    const [igRes, detRes, rankRes] = await Promise.all([
      supabase.from('influencer_ig_accounts').select('username, followers_count, profile_picture_url').eq('influencer_id', inf.id).maybeSingle(),
      supabase.from('influencer_detections').select('*').eq('influencer_id', inf.id).order('posted_at', { ascending: false }),
      supabase.from('influencers').select('id, score').order('score', { ascending: false }),
    ]);

    const allRanked = rankRes.data ?? [];
    const rank = allRanked.findIndex(r => r.id === inf.id) + 1;

    setData({
      influencer: inf as any,
      ig: igRes.data ?? null,
      detections: detRes.data ?? [],
      rank,
      total: allRanked.length,
    });
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 size={32} className="text-amber-400 animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-white font-semibold">Algo deu errado</p>
        <p className="text-white/40 text-sm mt-1">{error}</p>
      </div>
    </div>
  );

  const { influencer, ig, detections, rank, total } = data;
  const level = (influencer.level as Level) ?? 'bronze';
  const lvl = LEVEL[level];

  const totalCreation   = detections.reduce((s, d) => s + (d.media_type === 'VIDEO' ? 30 : d.media_type === 'STORY' ? 10 : 20), 0);
  const totalReach      = detections.reduce((s, d) => {
    const r = d.reach ?? 0;
    let pts = 0;
    if (d.media_type === 'VIDEO') {
      pts = r >= 50000 ? 100 : r >= 20000 ? 60 : r >= 5000 ? 30 : 10;
    } else if (d.media_type === 'STORY') {
      pts = r >= 5000 ? 30 : r >= 2000 ? 18 : r >= 500 ? 8 : 2;
    } else {
      pts = r >= 20000 ? 60 : r >= 8000 ? 35 : r >= 2000 ? 15 : 5;
    }
    return s + pts;
  }, 0);
  const totalEngagement = detections.reduce((s, d) => s + (d.saves ?? 0) * 0.5 + (d.shares ?? 0) * 0.5 + (d.comments ?? 0) * 0.2 + (d.likes ?? 0) * 0.05, 0);
  const calculatedScore = totalCreation + totalReach + Math.round(totalEngagement);

  const score = calculatedScore > 0 ? calculatedScore : Math.round(influencer.score ?? 0);
  const nextPts = lvl.next ? lvl.next - score : null;
  const prevPts = level === 'bronze' ? 0 : level === 'prata' ? 300 : level === 'ouro' ? 600 : 900;
  const pct = lvl.next ? Math.min(100, ((score - prevPts) / (lvl.next - prevPts)) * 100) : 100;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-4 text-center">
        <p className="text-[10px] tracking-[0.3em] text-amber-400/60 uppercase">Programa de Influenciadores</p>
        <h1 className="text-xl font-bold tracking-wide mt-0.5">LAGUN</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Profile card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex items-center gap-4">
          {ig?.profile_picture_url ? (
            <img src={ig.profile_picture_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 shrink-0" style={{ borderColor: lvl.color }} />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-xl font-bold border-2" style={{ background: lvl.bg, borderColor: lvl.color, color: lvl.color }}>
              {influencer.full_name.slice(0,2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate">{influencer.full_name}</p>
            {ig && (
              <p className="text-sm text-white/50 flex items-center gap-1 mt-0.5">
                <Instagram size={12} /> @{ig.username}
                <span className="text-white/30">· {ig.followers_count.toLocaleString('pt-BR')} seg.</span>
              </p>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-semibold mt-1.5 px-2.5 py-1 rounded-full border" style={{ background: lvl.bg, borderColor: lvl.border, color: lvl.color }}>
              {lvl.icon} {lvl.label}
            </span>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold" style={{ color: lvl.color }}>{score}</p>
            <p className="text-[11px] text-white/40">pontos</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/50">{lvl.label}</span>
            {lvl.next && <span className="text-white/50">{nextPts} pts para {LEVEL[Object.keys(LEVEL).find(k => LEVEL[k as Level].next === lvl.next ? false : LEVEL[k as Level].next! > score) as Level ?? 'diamante']?.label ?? 'Diamante'}</span>}
            {!lvl.next && <span style={{ color: lvl.color }}>Nível máximo 💎</span>}
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: lvl.color }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-amber-400">#{rank}</p>
            <p className="text-[10px] text-white/40 mt-0.5">de {total} no ranking</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-pink-400">{detections.length}</p>
            <p className="text-[10px] text-white/40 mt-0.5">posts detectados</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-purple-400">{detections.reduce((s, d) => s + d.likes, 0).toLocaleString('pt-BR')}</p>
            <p className="text-[10px] text-white/40 mt-0.5">curtidas totais</p>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Breakdown dos pontos</p>
          <div className="space-y-2.5">
            {[
              { label: 'Criação', pts: totalCreation, color: '#f472b6', tip: `${detections.length} posts` },
              { label: 'Alcance', pts: totalReach, color: '#34d399', tip: 'por faixas' },
              { label: 'Engajamento', pts: Math.round(totalEngagement), color: '#a78bfa', tip: 'saves, shares, comentários' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60">{item.label} <span className="text-white/30">({item.tip})</span></span>
                  <span className="font-semibold" style={{ color: item.color }}>{Math.max(0, item.pts)} pts</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${score > 0 ? Math.min(100, (Math.max(0, item.pts) / score) * 100) : 0}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detected posts */}
        {detections.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Posts com @lagunvix detectados</p>
            <div className="space-y-3">
              {detections.map(d => {
                const mt = MEDIA_LABELS[d.media_type] ?? MEDIA_LABELS.IMAGE;
                const Icon = mt.icon;
                const postScore = Math.round(calcScore(d));
                return (
                  <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
                    {/* Thumbnail */}
                    {d.thumbnail_url ? (
                      <img src={d.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                        <Icon size={18} className="text-white/30" />
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] text-white/40 border border-white/10 rounded px-1.5 py-0.5 flex items-center gap-1">
                          <Icon size={9} /> {mt.label}
                        </span>
                        {d.posted_at && (
                          <span className="text-[10px] text-white/30">
                            {new Date(d.posted_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50 truncate">{d.caption?.slice(0, 60) ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-white/30">
                        {d.reach > 0 && <span>👁 {d.reach.toLocaleString('pt-BR')}</span>}
                        {d.likes > 0 && <span>❤️ {d.likes.toLocaleString('pt-BR')}</span>}
                        {d.saves > 0 && <span>🔖 {d.saves}</span>}
                        {d.shares > 0 && <span>↗ {d.shares}</span>}
                      </div>
                    </div>
                    {/* Score + link */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <span className="text-sm font-bold text-amber-400">+{postScore}</span>
                      {d.permalink && (
                        <a href={d.permalink} target="_blank" rel="noreferrer" className="text-white/20 hover:text-white/60 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {detections.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-2xl mb-2">📸</p>
            <p className="text-sm font-medium text-white/60">Nenhum post detectado ainda</p>
            <p className="text-xs text-white/30 mt-1">Poste no Instagram mencionando <span className="text-amber-400">@lagunvix</span> para acumular pontos!</p>
          </div>
        )}

        <p className="text-center text-[10px] text-white/20 pb-4">
          Atualizado mensalmente · © {new Date().getFullYear()} Lagun — Vitória/ES
        </p>
      </div>
    </div>
  );
}
