import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Download, Search, Users } from 'lucide-react';
import LoadingState from '@/components/interno/LoadingState';

type Lista = 'divulgacao' | 'prevenda' | 'aniversariantes';

const LISTAS: Record<Lista, { label: string; table: string; columns: { key: string; label: string }[] }> = {
  divulgacao: {
    label: 'Divulgação · Maestria',
    table: 'maestria_divulgadores',
    columns: [
      { key: 'full_name', label: 'Nome' },
      { key: 'instagram', label: 'Instagram' },
      { key: 'phone', label: 'WhatsApp' },
      { key: 'email', label: 'E-mail' },
      { key: 'city', label: 'Cidade' },
      { key: 'is_creator', label: 'Creator?' },
      { key: 'origin', label: 'Origem' },
      { key: 'created_at', label: 'Cadastro' },
    ],
  },
  prevenda: {
    label: 'Pré-venda · Maestria',
    table: 'maestria_prevenda',
    columns: [
      { key: 'full_name', label: 'Nome' },
      { key: 'phone', label: 'WhatsApp' },
      { key: 'email', label: 'E-mail' },
      { key: 'origin', label: 'Origem' },
      { key: 'created_at', label: 'Cadastro' },
    ],
  },
  aniversariantes: {
    label: 'Aniversariantes · Maestria',
    table: 'maestria_birthday',
    columns: [
      { key: 'full_name', label: 'Nome' },
      { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'email', label: 'E-mail' },
      { key: 'cpf', label: 'CPF' },
      { key: 'birth_date', label: 'Nascimento' },
      { key: 'coupon', label: 'Cupom' },
      { key: 'created_at', label: 'Cadastro' },
    ],
  },
};

export default function InternoMaestriaCaptacao() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const lista = (params.get('lista') as Lista) || 'divulgacao';
  const cfg = LISTAS[lista] || LISTAS.divulgacao;

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all: any[] = [];
        let from = 0;
        const size = 1000;
        while (true) {
          const { data, error } = await (supabase as any)
            .from(cfg.table)
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, from + size - 1);
          if (error) throw error;
          const batch = data || [];
          all.push(...batch);
          if (batch.length < size) break;
          from += size;
        }
        setRows(all);
      } catch (e) {
        console.error('[Maestria Captação]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [cfg.table]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      cfg.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q))
    );
  }, [rows, search, cfg.columns]);

  function exportCSV() {
    const headers = cfg.columns.map((c) => c.label);
    const lines = [
      headers.join(','),
      ...filtered.map((r) =>
        cfg.columns
          .map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestria-${lista}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fmtCell(value: any, key: string) {
    if (value == null || value === '') return '—';
    if (key === 'created_at' || key === 'birth_date') {
      try { return new Date(value).toLocaleDateString('pt-BR'); } catch { return String(value); }
    }
    if (key === 'is_creator') return value ? 'Sim' : 'Não';
    return String(value);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/interno/eventos')}>
            <ArrowLeft size={14} className="mr-1" /> Voltar
          </Button>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Users size={16} className="text-[#FF0080]" /> {cfg.label}
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Carregando…' : `${rows.length.toLocaleString('pt-BR')} cadastro(s)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md border border-border p-0.5 bg-muted/30">
            {(['divulgacao', 'prevenda', 'aniversariantes'] as Lista[]).map((l) => (
              <button
                key={l}
                onClick={() => navigate(`/interno/maestria-captacao?lista=${l}`)}
                className={`px-3 py-1 text-xs rounded ${
                  l === lista ? 'bg-pink-600 text-white' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {LISTAS[l].label.split(' · ')[0]}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={exportCSV} disabled={loading || filtered.length === 0}>
            <Download size={14} className="mr-1" /> Baixar CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
            <span>Lista de cadastros</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-56 text-xs"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label={cfg.label} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {rows.length === 0 ? 'Nenhum cadastro ainda.' : 'Nada encontrado para essa busca.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    {cfg.columns.map((c) => (
                      <th key={c.key} className="py-2 px-2 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      {cfg.columns.map((c) => (
                        <td key={c.key} className="py-2 px-2">{fmtCell(r[c.key], c.key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
