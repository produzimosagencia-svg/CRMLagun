import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Users, Instagram, Plus, Check, RefreshCw, Trash2,
  ExternalLink, Crown, BarChart3, Link2, Search, Trophy, Medal, Star,
  ChevronDown, ChevronUp, Film, Image, Radio
} from 'lucide-react';

interface Influencer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  instagram_username: string | null;
  invite_token: string;
  status: string;
  notes: string | null;
  created_at: string;
  connected_at: string | null;
  score: number;
  level: string;
  score_updated_at: string | null;
  ig_account?: {
    username: string;
    followers_count: number;
    profile_picture_url: string | null;
    status: string;
    last_synced_at: string | null;
  } | null;
  detections_count?: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Aguardando',  color: 'bg-yellow-100 text-yellow-700' },
  connected: { label: 'Conectado',   color: 'bg-green-100 text-green-700' },
  inactive:  { label: 'Inativo',     color: 'bg-gray-100 text-gray-500' },
};

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any; min: number; max: number }> = {
  bronze:   { label: 'Bronze',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: Medal,  min: 0,   max: 299 },
  prata:    { label: 'Prata',    color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200',   icon: Star,   min: 300, max: 599 },
  ouro:     { label: 'Ouro',     color: 'text-yellow-500', bg: 'bg-yellow-50 border-yellow-200', icon: Trophy, min: 600, max: 899 },
  diamante: { label: 'Diamante', color: 'text-blue-500',   bg: 'bg-blue-50 border-blue-200',     icon: Crown,  min: 900, max: Infinity },
};

function LevelBadge({ level, score }: { level: string; score: number }) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.bronze;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon size={10} /> {cfg.label} · {Math.round(score)} pts
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const level = score >= 900 ? 'diamante' : score >= 600 ? 'ouro' : score >= 300 ? 'prata' : 'bronze';
  const cfg = LEVEL_CONFIG[level];
  const next = cfg.max === Infinity ? null : cfg.max + 1;
  const pct = next ? Math.min(100, ((score - cfg.min) / (next - cfg.min)) * 100) : 100;
  const barColors: Record<string, string> = {
    bronze: 'bg-amber-400', prata: 'bg-slate-400', ouro: 'bg-yellow-400', diamante: 'bg-blue-400',
  };
  return (
    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${barColors[level]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function InternoDivulgadores() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [tab, setTab]                 = useState<'lista' | 'ranking'>('lista');
  const [addOpen, setAddOpen]         = useState(false);
  const [copiedId, setCopiedId]       = useState<string | null>(null);
  const [form, setForm]               = useState({ full_name: '', email: '', phone: '', instagram_username: '', notes: '' });
  const [saving, setSaving]           = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [totalDetections, setTotalDetections] = useState(0);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [detections, setDetections]   = useState<Record<string, any[]>>({});

  const baseUrl = window.location.origin;

  async function load() {
    setLoading(true);
    const { data: infs } = await supabase
      .from('influencers')
      .select('*')
      .order('score', { ascending: false });

    if (!infs) { setLoading(false); return; }

    const ids = infs.map(i => i.id);

    const [igRes, detRes] = await Promise.all([
      supabase.from('influencer_ig_accounts').select('*').in('influencer_id', ids),
      supabase.from('influencer_detections').select('influencer_id').in('influencer_id', ids),
    ]);

    const igMap: Record<string, any> = {};
    for (const a of igRes.data ?? []) igMap[a.influencer_id] = a;

    const detMap: Record<string, number> = {};
    for (const d of detRes.data ?? []) detMap[d.influencer_id] = (detMap[d.influencer_id] || 0) + 1;

    setTotalDetections(detRes.data?.length ?? 0);
    setInfluencers(infs.map(i => ({
      ...i,
      score: i.score ?? 0,
      level: i.level ?? 'bronze',
      ig_account: igMap[i.id] ?? null,
      detections_count: detMap[i.id] ?? 0,
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!form.full_name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    const { error } = await supabase.from('influencers').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      instagram_username: form.instagram_username.trim().replace(/^@/, '') || null,
      notes: form.notes.trim() || null,
    });
    if (error) { toast.error('Erro ao adicionar'); }
    else {
      toast.success('Influenciador adicionado');
      setAddOpen(false);
      setForm({ full_name: '', email: '', phone: '', instagram_username: '', notes: '' });
      load();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este influenciador?')) return;
    await supabase.from('influencers').delete().eq('id', id);
    toast.success('Removido');
    load();
  }

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(`${baseUrl}/influenciadores/conectar?token=${token}`);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function toggleExpand(infId: string) {
    if (expandedId === infId) { setExpandedId(null); return; }
    setExpandedId(infId);
    if (detections[infId]) return;
    const { data } = await supabase
      .from('influencer_detections')
      .select('*')
      .eq('influencer_id', infId)
      .order('posted_at', { ascending: false });
    setDetections(prev => ({ ...prev, [infId]: data ?? [] }));
  }

  function calcPostScore(d: any): number {
    const creation = d.media_type === 'VIDEO' ? 30 : d.media_type === 'STORY' ? 10 : 20;
    let reach = 0;
    if (d.media_type === 'VIDEO') {
      if (d.reach >= 50000) reach = 100; else if (d.reach >= 20000) reach = 60; else if (d.reach >= 5000) reach = 30; else reach = 10;
    } else if (d.media_type === 'STORY') {
      if (d.reach >= 5000) reach = 30; else if (d.reach >= 2000) reach = 18; else if (d.reach >= 500) reach = 8; else reach = 2;
    } else {
      if (d.reach >= 20000) reach = 60; else if (d.reach >= 8000) reach = 35; else if (d.reach >= 2000) reach = 15; else reach = 5;
    }
    return creation + reach + (d.saves ?? 0) * 0.5 + (d.shares ?? 0) * 0.5 + (d.comments ?? 0) * 0.2 + (d.likes ?? 0) * 0.05;
  }

  const MEDIA_ICONS: Record<string, any> = { VIDEO: Film, IMAGE: Image, CAROUSEL_ALBUM: Image, STORY: Radio };
  const MEDIA_LABELS: Record<string, string> = { VIDEO: 'Reel', IMAGE: 'Post', CAROUSEL_ALBUM: 'Carrossel', STORY: 'Story' };

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('influencer-content-sync');
      if (error) throw error;
      toast.success(`Sincronizado: ${data?.detected ?? 0} conteúdos detectados`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao sincronizar');
    }
    setSyncing(false);
  }

  const filtered = influencers.filter(i =>
    i.full_name.toLowerCase().includes(search.toLowerCase()) ||
    i.instagram_username?.toLowerCase().includes(search.toLowerCase()) ||
    i.ig_account?.username?.toLowerCase().includes(search.toLowerCase())
  );

  const connected    = influencers.filter(i => i.ig_account?.status === 'active').length;
  const topScore     = influencers[0]?.score ?? 0;

  const rankingList = [...influencers].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Influenciadores</h2>
          <p className="text-xs text-muted-foreground">Programa de criadores de conteúdo Lagun.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5 text-xs">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Sincronizar
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 text-xs bg-pink-600 hover:bg-pink-700 text-white">
            <Plus size={13} /> Adicionar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-pink-50 flex items-center justify-center shrink-0">
            <Users size={16} className="text-pink-500" />
          </div>
          <div>
            <p className="text-xl font-bold">{influencers.length}</p>
            <p className="text-[11px] text-muted-foreground">Cadastrados</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <Instagram size={16} className="text-green-500" />
          </div>
          <div>
            <p className="text-xl font-bold">{connected}</p>
            <p className="text-[11px] text-muted-foreground">IG conectado</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <BarChart3 size={16} className="text-purple-500" />
          </div>
          <div>
            <p className="text-xl font-bold">{totalDetections}</p>
            <p className="text-[11px] text-muted-foreground">Conteúdos</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['lista', 'ranking'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'ranking' ? '🏆 Ranking' : 'Lista'}
          </button>
        ))}
      </div>

      {/* Search (lista only) */}
      {tab === 'lista' && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar influenciador..."
            className="pl-8 text-sm h-9"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
      ) : tab === 'lista' ? (
        // ── Lista ──
        filtered.length === 0 ? (
          <div className="text-center py-12 border rounded-xl bg-white">
            <Crown size={32} className="mx-auto text-pink-200 mb-3" />
            <p className="text-sm font-medium text-gray-600">Nenhum influenciador ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar" para começar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inf => {
              const st = STATUS_LABELS[inf.status] ?? STATUS_LABELS.pending;
              const ig = inf.ig_account;
              return (
                <div key={inf.id} className="rounded-xl border bg-white p-4 flex items-center gap-4 hover:border-gray-200 transition-all">
                  {ig?.profile_picture_url ? (
                    <img src={ig.profile_picture_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 border" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-pink-50 flex items-center justify-center shrink-0 border border-pink-100">
                      <span className="text-sm font-bold text-pink-400">{inf.full_name.slice(0,2).toUpperCase()}</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{inf.full_name}</p>
                      <Badge className={`text-[10px] px-2 py-0.5 ${st.color} border-0`}>{st.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {ig ? (
                        <span className="text-xs text-pink-600 flex items-center gap-1">
                          <Instagram size={11} /> @{ig.username}
                          <span className="text-muted-foreground">· {ig.followers_count.toLocaleString('pt-BR')} seg.</span>
                        </span>
                      ) : inf.instagram_username ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Instagram size={11} /> @{inf.instagram_username}
                          <span className="text-yellow-600">(aguardando)</span>
                        </span>
                      ) : null}
                      {inf.detections_count! > 0 && (
                        <span className="text-xs text-purple-600">{inf.detections_count} post{inf.detections_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {inf.score > 0 && (
                      <div className="mt-1.5">
                        <LevelBadge level={inf.level} score={inf.score} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copyLink(inf.invite_token, inf.id)} className="gap-1.5 text-xs h-8" title="Copiar link de conexão">
                      {copiedId === inf.id ? <Check size={12} className="text-green-500" /> : <Link2 size={12} />}
                      {copiedId === inf.id ? 'Copiado' : 'Link'}
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-8 px-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                      title="Ver portal do influenciador"
                      onClick={() => window.open(`/influenciadores/portal?token=${inf.invite_token}`, '_blank')}
                    >
                      <Trophy size={12} />
                    </Button>
                    {ig && (
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => window.open(`https://instagram.com/${ig.username}`, '_blank')}>
                        <ExternalLink size={12} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(inf.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // ── Ranking ──
        rankingList.length === 0 ? (
          <div className="text-center py-12 border rounded-xl bg-white">
            <Trophy size={32} className="mx-auto text-yellow-200 mb-3" />
            <p className="text-sm font-medium text-gray-600">Nenhuma pontuação ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Sincronize os conteúdos para gerar o ranking</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Level summary pills */}
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => {
                const count = influencers.filter(i => i.level === key).length;
                const Icon = cfg.icon;
                return (
                  <div key={key} className={`rounded-xl border p-3 text-center ${cfg.bg}`}>
                    <Icon size={16} className={`mx-auto mb-1 ${cfg.color}`} />
                    <p className={`text-lg font-bold ${cfg.color}`}>{count}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Ranking list */}
            {rankingList.map((inf, idx) => {
              const ig = inf.ig_account;
              const cfg = LEVEL_CONFIG[inf.level] ?? LEVEL_CONFIG.bronze;
              const nextLevel = Object.entries(LEVEL_CONFIG).find(([, c]) => c.min > inf.score);
              const ptsToNext = nextLevel ? nextLevel[1].min - inf.score : null;
              const medals = ['🥇', '🥈', '🥉'];
              const medal = medals[idx] ?? `#${idx + 1}`;

              return (
                <div key={inf.id} className={`rounded-xl border bg-white p-4 flex items-center gap-4 ${idx === 0 ? 'ring-1 ring-yellow-300' : ''}`}>
                  {/* Position */}
                  <div className="w-8 text-center shrink-0">
                    <span className="text-lg">{medal}</span>
                  </div>

                  {/* Avatar */}
                  {ig?.profile_picture_url ? (
                    <img src={ig.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center shrink-0 border border-pink-100">
                      <span className="text-sm font-bold text-pink-400">{inf.full_name.slice(0,2).toUpperCase()}</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{inf.full_name}</p>
                      {ig && <span className="text-xs text-muted-foreground">@{ig.username}</span>}
                    </div>
                    <div className="mt-1">
                      <LevelBadge level={inf.level} score={inf.score} />
                    </div>
                    <div className="mt-1.5">
                      <ScoreBar score={inf.score} />
                      {ptsToNext !== null && ptsToNext > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {Math.round(ptsToNext)} pts para {Object.entries(LEVEL_CONFIG).find(([,c]) => c.min > inf.score)?.[1].label}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Score + expand */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className={`text-xl font-bold ${cfg.color}`}>{Math.round(inf.score)}</p>
                    <p className="text-[10px] text-muted-foreground">pontos</p>
                    {inf.detections_count! > 0 && (
                      <button
                        onClick={() => toggleExpand(inf.id)}
                        className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5 mt-0.5"
                      >
                        {inf.detections_count} posts
                        {expandedId === inf.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded posts */}
                {expandedId === inf.id && (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    {!detections[inf.id] ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>
                    ) : detections[inf.id].length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Nenhum post detectado</p>
                    ) : (
                      detections[inf.id].map((d: any) => {
                        const Icon = MEDIA_ICONS[d.media_type] ?? Image;
                        const score = Math.round(calcPostScore(d));
                        return (
                          <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border text-xs">
                            {d.thumbnail_url ? (
                              <img src={d.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                <Icon size={14} className="text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] bg-white border rounded px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
                                  <Icon size={9} /> {MEDIA_LABELS[d.media_type] ?? 'Post'}
                                </span>
                                {d.posted_at && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(d.posted_at).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                                <span className="text-[10px] text-amber-600 font-medium">palavra: {d.detected_mention}</span>
                              </div>
                              <p className="text-muted-foreground truncate">{d.caption?.slice(0, 80) ?? '—'}</p>
                              <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                                {d.reach > 0 && <span>👁 {d.reach.toLocaleString('pt-BR')}</span>}
                                {d.likes > 0 && <span>❤️ {d.likes}</span>}
                                {d.saves > 0 && <span>🔖 {d.saves}</span>}
                                {d.shares > 0 && <span>↗ {d.shares}</span>}
                                {d.comments > 0 && <span>💬 {d.comments}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <span className="font-bold text-amber-600 text-sm">+{score} pts</span>
                              {d.permalink && (
                                <a href={d.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              );
            })}
          </div>
        )
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Crown size={18} className="text-pink-500" /> Novo Influenciador
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Nome completo" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Instagram</Label>
              <Input value={form.instagram_username} onChange={e => setForm(p => ({ ...p, instagram_username: e.target.value }))} placeholder="@username" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." className="mt-1" type="email" />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(27) 9..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notas internas..." rows={2} className="mt-1 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-pink-600 hover:bg-pink-700 text-white gap-1.5">
              {saving && <RefreshCw size={13} className="animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
