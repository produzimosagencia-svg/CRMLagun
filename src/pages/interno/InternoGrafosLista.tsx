import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Network, Trash2, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface GraphMeta {
  id: string;
  name: string;
  updatedAt: string;
}

const INDEX_KEY = 'interno:grafos:index';
const LEGACY_KEY = 'interno:grafos:v1';

export default function InternoGrafosLista() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GraphMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('internal_page_state')
      .select('state, updated_at')
      .eq('page_key', INDEX_KEY)
      .maybeSingle();
    let list: GraphMeta[] = data?.state?.items ?? [];

    // Migrar grafo legado v1 se existir e não estiver no índice
    if (!list.length) {
      const { data: legacy } = await (supabase as any)
        .from('internal_page_state')
        .select('updated_at')
        .eq('page_key', LEGACY_KEY)
        .maybeSingle();
      if (legacy) {
        list = [{ id: 'v1', name: 'Grafo principal', updatedAt: legacy.updated_at }];
        await (supabase as any)
          .from('internal_page_state')
          .upsert({ page_key: INDEX_KEY, state: { items: list } }, { onConflict: 'page_key' });
      }
    }
    setItems(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) return;
    const id = crypto.randomUUID();
    const next: GraphMeta[] = [...items, { id, name: n, updatedAt: new Date().toISOString() }];
    await (supabase as any)
      .from('internal_page_state')
      .upsert({ page_key: INDEX_KEY, state: { items: next } }, { onConflict: 'page_key' });
    setItems(next);
    setName('');
    setCreateOpen(false);
    navigate(`/interno/grafos/${id}`);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Excluir grafo',
      description: 'Excluir este grafo? Essa ação não pode ser desfeita.',
      confirmText: 'Excluir',
      destructive: true,
    });
    if (!ok) return;
    const next = items.filter((i) => i.id !== id);
    await (supabase as any)
      .from('internal_page_state')
      .upsert({ page_key: INDEX_KEY, state: { items: next } }, { onConflict: 'page_key' });
    await (supabase as any)
      .from('internal_page_state')
      .delete()
      .eq('page_key', `interno:grafos:v1:${id}`);
    setItems(next);
    toast.success('Grafo excluído');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-[#FF0080]" />
          <h1 className="text-2xl font-bold">RMKT (Grafos)</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-[#FF0080] hover:bg-[#FF0080]/90">
          <Plus className="h-4 w-4" /> Novo grafo
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <Share2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">Você ainda não tem grafos salvos.</p>
          <Button onClick={() => setCreateOpen(true)} className="bg-[#FF0080] hover:bg-[#FF0080]/90">
            <Plus className="h-4 w-4" /> Criar primeiro grafo
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div
              key={g.id}
              className="group p-4 rounded-lg border bg-card hover:border-[#FF0080] transition-colors cursor-pointer"
              onClick={() => navigate(`/interno/grafos/${g.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Share2 className="h-4 w-4 text-[#FF0080]" />
                    <h3 className="font-semibold truncate">{g.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Atualizado {new Date(g.updatedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo grafo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nome do grafo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Remarketing Maestria 2026"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} className="bg-[#FF0080] hover:bg-[#FF0080]/90">
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
