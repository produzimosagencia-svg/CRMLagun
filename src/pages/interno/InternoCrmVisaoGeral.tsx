import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users, MapPin, Home, BarChart3, TrendingUp, Calendar } from 'lucide-react';

interface LocationStats {
  name: string;
  count: number;
  percentage: number;
}

interface DashboardMetrics {
  totalCustomers: number;
  newCustomers30d: number;
  superfans: number;
  fans: number;
  averageEventsPerCustomer: number;
}

interface RecentEvent {
  name: string;
  customerCount: number;
}

export default function InternoCrmVisaoGeral() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalCustomers: 0,
    newCustomers30d: 0,
    superfans: 0,
    fans: 0,
    averageEventsPerCustomer: 0,
  });
  const [neighborhoodsData, setNeighborhoodsData] = useState<LocationStats[]>([]);
  const [citiesData, setCitiesData] = useState<LocationStats[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: customers } = await supabase
          .from('crm_customers')
          .select('*');

        if (!customers || customers.length === 0) {
          setLoading(false);
          return;
        }

        const totalCustomers = customers.length;

        // Calculate new customers in last 30 days
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const newCustomers30d = customers.filter(
          (c) => c.created_at && new Date(c.created_at) > thirtyDaysAgo
        ).length;

        // Get event data from base_crm
        const { data: baseCrm } = await supabase
          .from('base_crm')
          .select('total_eventos, created_at, ultimo_evento');

        let superfans = 0;
        let fans = 0;
        let totalEvents = 0;

        if (baseCrm && baseCrm.length > 0) {
          superfans = baseCrm.filter((c) => (c.total_eventos ?? 0) > 5).length;
          fans = baseCrm.filter((c) => (c.total_eventos ?? 0) >= 1).length;
          totalEvents = baseCrm.reduce((sum, c) => sum + (c.total_eventos ?? 0), 0);
        }

        const averageEventsPerCustomer = baseCrm && baseCrm.length > 0 ? totalEvents / baseCrm.length : 0;

        setMetrics({
          totalCustomers,
          newCustomers30d,
          superfans,
          fans,
          averageEventsPerCustomer,
        });

        // Group by neighborhoods
        const neighborhoodsMap = new Map<string, number>();
        customers.forEach((c) => {
          const neighborhood = c.neighborhood || 'Não informado';
          neighborhoodsMap.set(neighborhood, (neighborhoodsMap.get(neighborhood) ?? 0) + 1);
        });

        const neighborhoodsArray = Array.from(neighborhoodsMap.entries())
          .map(([name, count]) => ({
            name,
            count,
            percentage: (count / totalCustomers) * 100,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setNeighborhoodsData(neighborhoodsArray);

        // Group by cities
        const citiesMap = new Map<string, number>();
        customers.forEach((c) => {
          const city = c.city || 'Não informado';
          citiesMap.set(city, (citiesMap.get(city) ?? 0) + 1);
        });

        const citiesArray = Array.from(citiesMap.entries())
          .map(([name, count]) => ({
            name,
            count,
            percentage: (count / totalCustomers) * 100,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setCitiesData(citiesArray);

        // Get recent events
        if (baseCrm && baseCrm.length > 0) {
          const eventsMap = new Map<string, number>();
          baseCrm.forEach((c) => {
            if (c.ultimo_evento) {
              eventsMap.set(c.ultimo_evento, (eventsMap.get(c.ultimo_evento) ?? 0) + 1);
            }
          });

          const recentEventsArray = Array.from(eventsMap.entries())
            .map(([name, count]) => ({
              name,
              customerCount: count,
            }))
            .sort((a, b) => b.customerCount - a.customerCount)
            .slice(0, 5);

          setRecentEvents(recentEventsArray);
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
          Visão Geral - CRM
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Análise de clientes, geográfica e histórico de eventos
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <Users size={16} />
              Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.totalCustomers.toLocaleString('pt-BR')}
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
              {metrics.newCustomers30d.toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <BarChart3 size={16} />
              Superfãs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.superfans.toLocaleString('pt-BR')}
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
              {metrics.fans.toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <BarChart3 size={16} />
              Média por Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.averageEventsPerCustomer.toFixed(1)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Neighborhoods */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home size={20} />
              Clientes por Bairro (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {neighborhoodsData.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum dado disponível</p>
              ) : (
                neighborhoodsData.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {item.name}
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white ml-2">
                        {item.count}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cities */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin size={20} />
              Clientes por Cidade (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {citiesData.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum dado disponível</p>
              ) : (
                citiesData.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {item.name}
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white ml-2">
                        {item.count}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar size={20} />
              Últimos Eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentEvents.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum evento registrado</p>
              ) : (
                recentEvents.map((event) => (
                  <div key={event.name} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-xs font-medium text-gray-900 dark:text-white truncate flex-1">
                      {event.name}
                    </span>
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 ml-2">
                      {event.customerCount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
