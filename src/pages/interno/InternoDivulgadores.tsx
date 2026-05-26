import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Users, Instagram, Plus, Copy, Check, RefreshCw, Trash2, ExternalLink, Crown, BarChart3, Link2, Search } from 'lucide-react';

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

export default function InternoDivulgadores() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', instagram_username: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [totalDetections, setTotalDetections] = useState(0);

  const baseUrl = window.location.origin;

  async function load() {
    setLoading(true);
    const { data: infs } = await supabase
      .from('influencers')
      .select('*')
      .order('created_at', { ascending: false });

    if (!infs) { setLoading(false); return; }

    const ids = infs.map(i => i.id);

    const [igRes, detRes] = await Promise.all([
      supabase.from('influencer_ig_accounts').select('*').in('influencer_id', ids),
      supabase.from('influencer_detections').select('influencer_id').in('influencer_id', ids),
    ]);

    const igMap: Record<string, any> = {};
    for (const a of igRes.data || []) igMap[a.influencer_id] = a;

    const detMap: Record<string, number> = {};
    for (const d of detRes.data || []) detMap[d.influencer_id] = (detMap[d.influencer_id] || 0) + 1;

    setTotalDetections(detRes.data?.length || 0);

    setInfluencers(infs.map(i => ({
      ...i,
      ig_account: igMap[i.id] || null,
      detections_count: detMap[i.id] || 0,
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
    const link = `${baseUrl}/influenciadores/conectar?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  }

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

  const connected = influencers.filter(i => i.ig_account?.status === 'active').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Influenciadores</h2>
          <p className="text-xs text-muted-foreground">Gerencie o programa e acompanhe as menções à Lagun.</p>
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

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar influenciador..."
          className="pl-8 text-sm h-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border rounded-xl bg-white">
          <Crown size={32} className="mx-auto text-pink-200 mb-3" />
          <p className="text-sm font-medium text-gray-600">Nenhum influenciador ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar" para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inf => {
            const st = STATUS_LABELS[inf.status] || STATUS_LABELS.pending;
            const ig = inf.ig_account;
            return (
              <div key={inf.id} className="rounded-xl border bg-white p-4 flex items-center gap-4 hover:border-gray-200 transition-all">
                {/* Avatar */}
                {ig?.profile_picture_url ? (
                  <img src={ig.profile_picture_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 border" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-pink-50 flex items-center justify-center shrink-0 border border-pink-100">
                    <span className="text-sm font-bold text-pink-400">{inf.full_name.slice(0,2).toUpperCase()}</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{inf.full_name}</p>
                    <Badge className={`text-[10px] px-2 py-0.5 ${st.color} border-0`}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
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
                      <span className="text-xs text-purple-600">
                        {inf.detections_count} post{inf.detections_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyLink(inf.invite_token, inf.id)}
                    className="gap-1.5 text-xs h-8"
                    title="Copiar link de conexão"
                  >
                    {copiedId === inf.id ? <Check size={12} className="text-green-500" /> : <Link2 size={12} />}
                    {copiedId === inf.id ? 'Copiado' : 'Link'}
                  </Button>
                  {ig && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => window.open(`https://instagram.com/${ig.username}`, '_blank')}
                    >
                      <ExternalLink size={12} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(inf.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
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
