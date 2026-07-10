import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cake, Download, Search } from 'lucide-react';
import LoadingState from '@/components/interno/LoadingState';
import { formatPhone } from '@/lib/formatPhone';

interface Birthday {
  id: string;
  full_name: string;
  whatsapp: string | null;
  email: string | null;
  birth_date: string;
  created_at: string;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function CrmAniversariantes() {
  const [rows, setRows] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all: Birthday[] = [];
        let from = 0;
        const size = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('crm_customers')
            .select('id, full_name, phone, email, birth_date, created_at')
            .not('birth_date', 'is', null)
            .order('birth_date', { ascending: true })
            .range(from, from + size - 1);
          if (error) throw error;
          const batch = ((data || []) as any[]).map((r) => ({
            id: r.id,
            full_name: r.full_name,
            whatsapp: r.phone,
            email: r.email,
            birth_date: r.birth_date,
            created_at: r.created_at,
          }));
          all.push(...batch);
          if (batch.length < size) break;
          from += size;
        }
        setRows(all);
      } catch (e) {
        console.error('[Aniversariantes]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const doMes = useMemo(() => {
    return rows.filter((r) => {
      if (!r.birth_date) return false;
      // birth_date vem como "YYYY-MM-DD"
      const m = parseInt(r.birth_date.slice(5, 7), 10);
      return m === mes;
    });
  }, [rows, mes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return doMes;
    const q = search.toLowerCase();
    return doMes.filter((r) =>
      [r.full_name, r.whatsapp, r.email]
        .some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [doMes, search]);

  // ordena por dia do mês
  const ordered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = parseInt(a.birth_date.slice(8, 10), 10) || 0;
      const db = parseInt(b.birth_date.slice(8, 10), 10) || 0;
      return da - db;
    });
  }, [filtered]);

  const countsByMonth = useMemo(() => {
    const c = new Array(13).fill(0);
    rows.forEach((r) => {
      if (!r.birth_date) return;
      const m = parseInt(r.birth_date.slice(5, 7), 10);
      if (m >= 1 && m <= 12) c[m]++;
    });
    return c;
  }, [rows]);

  function fmtData(d: string) {
    if (!d) return '—';
    const [, mm, dd] = d.split('-');
    return `${dd}/${mm}`;
  }

  function exportCSV() {
    const headers = ['Nome', 'WhatsApp', 'E-mail', 'Aniversário', 'Cadastro'];
    // Ponto-e-vírgula: separador esperado pelo Excel em português (vírgula = decimal)
    const lines = [
      headers.join(';'),
      ...ordered.map((r) =>
        [
          r.full_name,
          r.whatsapp || '',
          r.email || '',
          fmtData(r.birth_date),
          r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '',
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aniversariantes-${MESES[mes - 1].toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingState label="Aniversariantes" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Cake size={16} className="text-purple-600" /> Aniversariantes
          </h2>
          <p className="text-xs text-muted-foreground">
            {rows.length.toLocaleString('pt-BR')} cadastro(s) no total · {ordered.length} em {MESES[mes - 1]}
          </p>
        </div>
        <Button size="sm" onClick={exportCSV} disabled={ordered.length === 0}>
          <Download size={14} className="mr-1" /> Baixar CSV
        </Button>
      </div>

      {/* Seletor de meses */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1">
            {MESES.map((nome, i) => {
              const m = i + 1;
              const ativo = m === mes;
              return (
                <button
                  key={m}
                  onClick={() => setMes(m)}
                  className={`px-2 py-2 rounded text-xs font-medium transition-colors flex flex-col items-center ${
                    ativo
                      ? 'bg-purple-600 text-white'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span>{nome.slice(0, 3)}</span>
                  <span className={`text-[10px] ${ativo ? 'text-white/80' : 'text-muted-foreground/70'}`}>
                    {countsByMonth[m]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
            <span>Aniversariantes de {MESES[mes - 1]}</span>
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
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum aniversariante em {MESES[mes - 1]}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Dia</th>
                    <th className="py-2 px-2 font-medium">Nome</th>
                    <th className="py-2 px-2 font-medium">WhatsApp</th>
                    <th className="py-2 px-2 font-medium">E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="py-2 px-2 font-semibold text-purple-600">{fmtData(r.birth_date)}</td>
                      <td className="py-2 px-2">{r.full_name}</td>
                      <td className="py-2 px-2">{formatPhone(r.whatsapp || '')}</td>
                      <td className="py-2 px-2 text-muted-foreground">{r.email || '—'}</td>
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
