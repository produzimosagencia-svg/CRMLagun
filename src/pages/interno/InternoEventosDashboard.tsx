import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Ticket, DollarSign, Users, ShoppingCart, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const EVENTOS = [
  {
    id: 'lagun-friday',
    superticketId: '22540',
    nome: 'Lagun Friday',
    data: '16/05/2026',
    diaSemana: 'Sexta-feira',
  },
  {
    id: 'lagun-saturday',
    superticketId: '22541',
    nome: 'Lagun Saturday',
    data: '17/05/2026',
    diaSemana: 'Sábado',
  },
];

interface EventStats {
  totalVendas: number;
  receita: number;
  participantes: number;
  ultimas: { nome: string; valor: number; hora: string }[];
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(v: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const SUPABASE_URL = 'https://xwxiijbovreucnrbyput.supabase.co';

export default function InternoEventosDashboard() {
  const [stats, setStats] = useState<Record<string, EventStats | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const results = await Promise.all(
        EVENTOS.map(async (ev) => {
          try {
            const res = await fetch(
              `${SUPABASE_URL}/functions/v1/superticket-stats?event_id=${ev.superticketId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              console.error(`[${ev.nome}] erro:`, err);
              return { id: ev.id, stats: null };
            }
            const data = await res.json();
            return {
              id: ev.id,
              stats: {
                totalVendas: data.totalVendas ?? 0,
                receita: data.receita ?? 0,
                participantes: data.participantes ?? 0,
                ultimas: data.ultimas ?? [],
              } as EventStats,
            };
          } catch (e) {
            console.error(`[${ev.nome}] falha:`, e);
            return { id: ev.id, stats: null };
          }
        })
      );

      const newStats: Record<string, EventStats | null> = {};
      for (const r of results) newStats[r.id] = r.stats;
      setStats(newStats);

      if (isRefresh) toast.success('Dados atualizados!');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={24} style={{ color: '#C8960C' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Eventos</h2>
        <button
          onClick={() => loadStats(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"
          style={{ borderColor: 'rgba(200,150,12,0.4)', color: '#8B6914' }}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {EVENTOS.map(ev => {
          const st = stats[ev.id];
          const hasData = st !== null && st !== undefined && st.totalVendas > 0;
          const isError = st === null;

          return (
            <div
              key={ev.id}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: 'rgba(200,150,12,0.2)', backgroundColor: 'white' }}
            >
              {/* Header do card */}
              <div className="px-5 py-4 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg, #1A0800 0%, #2B0E00 100%)' }}>
                <div>
                  <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'rgba(245,212,112,0.6)' }}>
                    {ev.diaSemana}
                  </p>
                  <h3 className="text-base font-bold" style={{ color: '#F5D470' }}>{ev.nome}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{ev.data}</p>
                </div>
                <div className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: 'rgba(245,212,112,0.1)', color: 'rgba(245,212,112,0.5)', border: '1px solid rgba(245,212,112,0.2)' }}>
                  #{ev.superticketId}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 divide-x" style={{ borderBottom: '1px solid #f3f4f6' }}>
                <div className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Ticket size={13} className="text-gray-400" />
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vendas</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{st?.totalVendas ?? '—'}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <DollarSign size={13} className="text-gray-400" />
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Receita</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {st != null ? formatCurrency(st.receita) : '—'}
                  </p>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Users size={13} className="text-gray-400" />
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Participantes</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{st?.participantes ?? '—'}</p>
                </div>
              </div>

              {/* Últimas compras */}
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <ShoppingCart size={11} />
                  Últimas compras
                </p>

                {isError ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-red-400">Erro ao carregar dados</p>
                    <p className="text-[10px] text-gray-300 mt-1">Verifique o token da API nas configurações</p>
                  </div>
                ) : !hasData ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-400">Nenhuma venda ainda</p>
                    <p className="text-[10px] text-gray-300 mt-1">Os dados aparecerão assim que houver ingressos vendidos</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {st!.ultimas.map((u, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: '#f9fafb' }}>
                        <div>
                          <p className="text-xs font-medium text-gray-800">{u.nome}</p>
                          <p className="text-[10px] text-gray-400">{formatDateTime(u.hora)}</p>
                        </div>
                        <p className="text-xs font-bold" style={{ color: '#16a34a' }}>{formatCurrency(u.valor)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
