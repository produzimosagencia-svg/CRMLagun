import { useEffect, useState } from 'react';
import { Instagram, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Account {
  id: string;
  username: string;
  profile_picture_url: string | null;
  followers_count: number;
  media_count: number;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
  creator_id: string;
}

interface Detection {
  id: string;
  media_type: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  detected_mention: string | null;
  reach: number;
  likes: number;
  comments: number;
  posted_at: string | null;
  creator_id: string;
}

interface Target {
  id: string;
  username: string;
  display_name: string | null;
  active: boolean;
}

interface Creator {
  id: string;
  full_name: string;
  instagram: string;
}

export default function InternoDivulgadoresInstagram() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [creators, setCreators] = useState<Record<string, Creator>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newTarget, setNewTarget] = useState('');

  const load = async () => {
    setLoading(true);
    const [accRes, detRes, tgtRes, crRes] = await Promise.all([
      supabase.from('creator_instagram_accounts').select('*').order('connected_at', { ascending: false }),
      supabase.from('creator_content_detections').select('*').order('posted_at', { ascending: false }).limit(100),
      supabase.from('promotion_target_accounts').select('*').order('username'),
      supabase.from('crm_creators').select('id, full_name, instagram'),
    ]);
    setAccounts((accRes.data as Account[]) || []);
    setDetections((detRes.data as Detection[]) || []);
    setTargets((tgtRes.data as Target[]) || []);
    const cmap: Record<string, Creator> = {};
    for (const c of (crRes.data as Creator[]) || []) cmap[c.id] = c;
    setCreators(cmap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('creator-instagram-sync');
      if (error) throw error;
      toast.success(`Sincronização concluída: ${data?.detections_upserted ?? 0} conteúdos detectados`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const addTarget = async () => {
    const u = newTarget.trim().replace(/^@/, '');
    if (!u) return;
    const { error } = await supabase.from('promotion_target_accounts').insert({ username: u, active: true });
    if (error) toast.error(error.message);
    else { toast.success('Adicionado'); setNewTarget(''); load(); }
  };

  const removeTarget = async (id: string) => {
    const { error } = await supabase.from('promotion_target_accounts').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  // Ranking: agrupa detecções por creator
  const ranking = Object.values(
    detections.reduce((acc, d) => {
      acc[d.creator_id] = acc[d.creator_id] || { creator_id: d.creator_id, count: 0, reach: 0 };
      acc[d.creator_id].count++;
      acc[d.creator_id].reach += d.reach || 0;
      return acc;
    }, {} as Record<string, { creator_id: string; count: number; reach: number }>)
  ).sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Instagram className="text-pink-500" /> Divulgadores · Instagram
          </h1>
          <p className="text-sm text-muted-foreground">Contas conectadas, conteúdo detectado e ranking.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-pink-600 text-white font-semibold flex items-center gap-2 hover:bg-pink-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>

      {/* @s alvo */}
      <div className="rounded-xl border border-border p-4">
        <h2 className="font-semibold mb-3">@s monitorados</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder="@username"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background"
          />
          <button onClick={addTarget} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-1">
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {targets.map((t) => (
            <span key={t.id} className="px-3 py-1 rounded-full bg-muted flex items-center gap-2 text-sm">
              @{t.username}
              <button onClick={() => removeTarget(t.id)} className="text-red-500"><Trash2 size={14} /></button>
            </span>
          ))}
        </div>
      </div>

      {/* Contas conectadas */}
      <div className="rounded-xl border border-border p-4">
        <h2 className="font-semibold mb-3">Contas conectadas ({accounts.length})</h2>
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="p-3 rounded-lg border border-border flex items-center gap-3">
                {a.profile_picture_url ? (
                  <img src={a.profile_picture_url} alt={a.username} className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">@{a.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.followers_count.toLocaleString('pt-BR')} seguidores · {a.media_count} mídias
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {creators[a.creator_id]?.full_name || '—'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {a.status}
                </span>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Nenhuma conta conectada ainda.</p>}
          </div>
        )}
      </div>

      {/* Ranking */}
      <div className="rounded-xl border border-border p-4">
        <h2 className="font-semibold mb-3">🏆 Ranking de divulgadores</h2>
        <div className="space-y-2">
          {ranking.map((r, i) => (
            <div key={r.creator_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <span className="font-bold text-pink-600 w-6">#{i + 1}</span>
                <span>{creators[r.creator_id]?.full_name || '—'}</span>
                <span className="text-xs text-muted-foreground">@{creators[r.creator_id]?.instagram}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span><strong>{r.count}</strong> conteúdos</span>
                <span className="text-muted-foreground">{r.reach.toLocaleString('pt-BR')} alcance</span>
              </div>
            </div>
          ))}
          {ranking.length === 0 && <p className="text-sm text-muted-foreground">Nenhum conteúdo detectado ainda.</p>}
        </div>
      </div>

      {/* Conteúdo detectado */}
      <div className="rounded-xl border border-border p-4">
        <h2 className="font-semibold mb-3">Conteúdos detectados ({detections.length})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {detections.map((d) => (
            <a
              key={d.id}
              href={d.permalink || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden bg-muted block group"
            >
              {d.thumbnail_url && (
                <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-2 text-white text-[10px]">
                <p>{d.detected_mention}</p>
                <p>{d.likes}❤ · {d.comments}💬</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
