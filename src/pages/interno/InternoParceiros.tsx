import { useEffect, useMemo, useState } from 'react';
import { Handshake, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ConfirmDialog';
import { formatPhone } from '@/lib/formatPhone';
import { toast } from 'sonner';

/**
 * Produtores parceiros da casa (nome e telefone).
 *
 * Os eventos da landing são vinculados a eles no formulário do evento
 * (InternoLanding); aqui é só o cadastro. A coluna "Eventos" conta em quantos
 * eventos cada parceiro está.
 */

export interface Parceiro {
  id: string;
  nome: string;
  telefone: string | null;
}

const vazio = { nome: '', telefone: '' };

export default function InternoParceiros() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [eventosPorParceiro, setEventosPorParceiro] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [{ data: lista, error }, { data: vinculos }] = await Promise.all([
      (supabase as any).from('lagun_partners').select('id, nome, telefone').order('nome'),
      (supabase as any).from('lagun_event_partners').select('partner_id'),
    ]);
    if (error) toast.error('Erro ao carregar parceiros: ' + error.message);
    setParceiros((lista || []) as Parceiro[]);
    const contagem: Record<string, number> = {};
    ((vinculos || []) as { partner_id: string }[]).forEach(({ partner_id }) => {
      contagem[partner_id] = (contagem[partner_id] || 0) + 1;
    });
    setEventosPorParceiro(contagem);
    setCarregando(false);
  }

  useEffect(() => { void carregar(); }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    if (!termo) return parceiros;
    return parceiros.filter((p) =>
      p.nome.toLowerCase().includes(termo)
      || (digitos.length > 0 && (p.telefone || '').replace(/\D/g, '').includes(digitos)),
    );
  }, [parceiros, busca]);

  function novo() {
    setEditandoId(null);
    setForm(vazio);
    setAberto(true);
  }

  function editar(p: Parceiro) {
    setEditandoId(p.id);
    setForm({ nome: p.nome, telefone: p.telefone ?? '' });
    setAberto(true);
  }

  async function salvar() {
    const nome = form.nome.trim();
    const telefone = form.telefone.replace(/\D/g, '');
    if (nome.length < 2) { toast.error('Informe o nome do parceiro'); return; }
    if (telefone && (telefone.length < 10 || telefone.length > 13)) {
      toast.error('Telefone inválido: use DDD + número');
      return;
    }
    setSalvando(true);
    const payload = { nome, telefone: telefone || null, updated_at: new Date().toISOString() };
    const { error } = editandoId
      ? await (supabase as any).from('lagun_partners').update(payload).eq('id', editandoId)
      : await (supabase as any).from('lagun_partners').insert(payload);
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(editandoId ? 'Parceiro atualizado' : 'Parceiro cadastrado');
    setAberto(false);
    void carregar();
  }

  async function excluir(p: Parceiro) {
    const eventos = eventosPorParceiro[p.id] || 0;
    const ok = await confirmDialog({
      title: 'Excluir parceiro',
      description: eventos > 0
        ? `${p.nome} está vinculado a ${eventos} evento${eventos === 1 ? '' : 's'}. Excluir remove também esses vínculos.`
        : `Excluir ${p.nome} da lista de parceiros?`,
      confirmText: 'Excluir',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await (supabase as any).from('lagun_partners').delete().eq('id', p.id);
    if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
    toast.success('Parceiro excluído');
    void carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Handshake size={18} className="text-[#D9B14E]" /> Parceiros
          </h2>
          <p className="text-xs text-muted-foreground">
            Produtores parceiros da casa. Todo evento da landing precisa dizer quais parceiros participam, ou que é sem parceiro.
          </p>
        </div>
        <button
          onClick={novo}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D9B14E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#B98F35]"
        >
          <Plus size={16} /> Novo parceiro
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Telefone</th>
              <th className="px-4 py-3 font-semibold">Eventos</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td colSpan={4} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-muted" /></td>
                </tr>
              ))
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {parceiros.length === 0 ? 'Nenhum parceiro cadastrado ainda.' : 'Nenhum parceiro encontrado.'}
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{p.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.telefone ? (
                      <a href={`https://wa.me/55${p.telefone.replace(/^55/, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                        <Phone size={12} /> {formatPhone(p.telefone)}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{eventosPorParceiro[p.id] || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => editar(p)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Editar ${p.nome}`}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => void excluir(p)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" aria-label={`Excluir ${p.nome}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar parceiro' : 'Novo parceiro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
              <input
                autoFocus
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="ex: Produtora XYZ"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone (WhatsApp)</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); }}
                placeholder="(27) 99999-9999"
                inputMode="tel"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setAberto(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={() => void salvar()} disabled={salvando} className="flex-1 rounded-lg bg-[#D9B14E] py-2.5 text-sm font-medium text-white hover:bg-[#B98F35] disabled:opacity-60">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
