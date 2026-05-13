import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Loader2, Database } from 'lucide-react';

interface Orphan {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  ltv: number | null;
  classification: string | null;
  city: string | null;
  state: string | null;
  archived_at: string;
}

export default function InternoDados() {
  const [rows, setRows] = useState<Orphan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('crm_orphan_customers')
        .select('id, full_name, email, phone, ltv, classification, city, state, archived_at', { count: 'exact' })
        .order('archived_at', { ascending: false })
        .limit(200);

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`full_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
      }

      const { data, count } = await query;
      setRows((data ?? []) as Orphan[]);
      setTotal(count ?? 0);
      setLoading(false);
    };
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-[#FF0080]" />
        <div>
          <h1 className="text-2xl font-bold">Dados Arquivados</h1>
          <p className="text-sm text-muted-foreground">
            Clientes órfãos preservados (sem compras associadas). Total: <strong>{total.toLocaleString('pt-BR')}</strong>
          </p>
        </div>
      </div>

      <Input
        placeholder="Buscar por nome, email ou telefone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF0080]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Telefone</th>
                  <th className="text-left p-3">Cidade/UF</th>
                  <th className="text-left p-3">LTV</th>
                  <th className="text-left p-3">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{r.full_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.email || '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.phone || '—'}</td>
                    <td className="p-3">{[r.city, r.state].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="p-3">R$ {Number(r.ltv || 0).toFixed(2)}</td>
                    <td className="p-3">{r.classification || '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum registro</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 text-xs text-muted-foreground border-t bg-muted/20">
          Exibindo até 200 registros. Use a busca para filtrar entre os {total.toLocaleString('pt-BR')} arquivados.
        </div>
      </div>
    </div>
  );
}
