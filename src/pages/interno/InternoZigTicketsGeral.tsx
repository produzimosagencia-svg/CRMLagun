import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users, DollarSign, TrendingUp, Calendar } from 'lucide-react';

interface DashboardKPIs {
  total_customers: number;
  new_customers_30d: number;
  superclientes: number;
  fans: number;
  cac: number | null;
}

export default function InternoZigTicketsGeral() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: logs } = await supabase
          .from('webhook_logs')
          .select('payload, source')
          .eq('source', 'zig_tickets');

        if (logs) {
          const eventsMap = new Map<string, any>();
          for (const log of logs) {
            const p = (log.payload as any)?.payload;
            if (p?.event?.id && p?.event?.name) {
              eventsMap.set(String(p.event.id), p.event);
            }
          }
          setEvents(Array.from(eventsMap.values()));
        }

        const { data: crm } = await supabase
          .from('base_crm')
          .select('*');

        if (crm) {
          const totalCustomers = crm.length;
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const newCustomers = crm.filter(
            (c) => c.created_at && new Date(c.created_at) > thirtyDaysAgo
          ).length;

          const superfans = crm.filter((c) => (c.total_eventos ?? 0) > 5).length;
          const fans = crm.filter((c) => (c.total_eventos ?? 0) >= 1).length;

          setKpis({
            total_customers: totalCustomers,
            new_customers_30d: newCustomers,
            superclientes: superfans,
            fans: fans,
            cac: totalCustomers > 0 ? 0 : null,
          });
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Zig Tickets - Geral
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Panorama geral dos eventos e histórico de clientes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <Users size={16} />
              Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {kpis?.total_customers.toLocaleString('pt-BR') || '0'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <TrendingUp size={16} />
              Novos (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {kpis?.new_customers_30d.toLocaleString('pt-BR') || '0'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <Calendar size={16} />
              Superfãs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {kpis?.superclientes.toLocaleString('pt-BR') || '0'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <Users size={16} />
              Fãs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {kpis?.fans.toLocaleString('pt-BR') || '0'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {events.length === 0 ? (
              <p className="text-gray-500">Nenhum evento cadastrado</p>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={event.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="font-medium text-gray-900 dark:text-white">{event.name}</span>
                    <span className="text-sm text-gray-500">ID: {event.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
