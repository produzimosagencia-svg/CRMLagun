import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, Ticket, BarChart3, TrendingUp, MapPin } from 'lucide-react';
import type { CrmPurchase } from '@/types/crm';
import LoadingState from '@/components/interno/LoadingState';

interface CategoryDashboardProps {
  category: 'rap_trap' | 'pagode_funk';
  title: string;
}

interface CategoryStats {
  totalCustomers: number;
  totalRevenue: number;
  averageTicket: number;
  netProfit: number;
  topEvents: { name: string; count: number; revenue: number }[];
  topCities: { name: string; count: number }[];
  topNeighborhoods: { name: string; count: number }[];
}

// Fetch all rows paginating past the 1000-row limit
async function fetchAllPurchases(eventNames: string[]): Promise<CrmPurchase[]> {
  const all: CrmPurchase[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('crm_purchases')
      .select('*')
      .in('event_name', eventNames)
      .range(from, from + PAGE - 1) as any;
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function CrmCategoryDashboard({ category, title }: CategoryDashboardProps) {
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, [category]);

  async function loadStats() {
    setLoading(true);

    const { data: categoryEvents } = await supabase
      .from('event_categories')
      .select('event_name')
      .eq('category', category) as any;

    const eventNames: string[] = (categoryEvents || []).map((e: any) => e.event_name);

    if (eventNames.length === 0) {
      setStats({ totalCustomers: 0, totalRevenue: 0, averageTicket: 0, netProfit: 0, topEvents: [], topCities: [], topNeighborhoods: [] });
      setLoading(false);
      return;
    }

    const purch = await fetchAllPurchases(eventNames);

    // Get unique customer IDs and fetch their info for city/neighborhood
    const customerIds = [...new Set(purch.map(p => p.customer_id))];

    // Fetch customers in batches for city/neighborhood data
    const customerMap = new Map<string, { city: string | null; neighborhood: string | null }>();
    for (let i = 0; i < customerIds.length; i += 100) {
      const batch = customerIds.slice(i, i + 100);
      const { data: custs } = await supabase
        .from('crm_customers')
        .select('id, city, neighborhood')
        .in('id', batch) as any;
      if (custs) {
        for (const c of custs) {
          customerMap.set(c.id, { city: c.city, neighborhood: c.neighborhood });
        }
      }
    }

    const totalCustomers = customerIds.length;
    const totalRevenue = purch.reduce((s, p) => s + Number(p.total_value), 0);
    const averageTicket = purch.length > 0 ? totalRevenue / purch.length : 0;
    const netProfit = 0;

    // Top events
    const eventMap = new Map<string, { count: number; revenue: number }>();
    purch.forEach(p => {
      const curr = eventMap.get(p.event_name) || { count: 0, revenue: 0 };
      curr.count++;
      curr.revenue += Number(p.total_value);
      eventMap.set(p.event_name, curr);
    });
    const topEvents = Array.from(eventMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top cities from customers who purchased in this category
    const cityMap = new Map<string, number>();
    const nbMap = new Map<string, number>();
    for (const id of customerIds) {
      const cust = customerMap.get(id);
      if (cust?.city) cityMap.set(cust.city, (cityMap.get(cust.city) || 0) + 1);
      if (cust?.neighborhood) nbMap.set(cust.neighborhood, (nbMap.get(cust.neighborhood) || 0) + 1);
    }
    const topCities = Array.from(cityMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topNeighborhoods = Array.from(nbMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setStats({ totalCustomers, totalRevenue, averageTicket, netProfit, topEvents, topCities, topNeighborhoods });
    setLoading(false);
  }

  function handleEventClick(eventName: string) {
    navigate(`/interno/clientes?event=${encodeURIComponent(eventName)}`);
  }

  if (loading) return <LoadingState label={title} />;
  if (!stats) return <div className="text-purple-800">Erro ao carregar dados.</div>;

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {stats.topEvents.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-800">
              Nenhum evento classificado nesta categoria ainda. Classifique os eventos manualmente para ver os dados aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Clientes" value={stats.totalCustomers.toString()} />
        <StatCard icon={DollarSign} label="Receita Total" value={fmt(stats.totalRevenue)} />
        <StatCard icon={Ticket} label="Ticket Médio" value={fmt(stats.averageTicket)} />
        <StatCard icon={TrendingUp} label="Lucro Líquido" value={fmt(stats.netProfit)} />
      </div>

      {/* Events + Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events List - clickable */}
        {stats.topEvents.length > 0 && (
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
                <BarChart3 size={18} /> Eventos - {title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topEvents.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-purple-50 cursor-pointer transition-colors"
                    onClick={() => handleEventClick(e.name)}
                  >
                    <div>
                      <p className="font-medium text-sm text-purple-900 hover:underline">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.count} vendas</p>
                    </div>
                    <span className="font-semibold text-sm text-purple-700">{fmt(e.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cities & Neighborhoods */}
        <div className="space-y-6">
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
                <MapPin size={18} /> Principais Cidades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topCities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de localização.</p>
              ) : (
                <div className="space-y-2">
                  {stats.topCities.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-purple-900">{c.name}</span>
                      <span className="text-muted-foreground">{c.count} clientes</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
                <MapPin size={18} /> Principais Bairros
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topNeighborhoods.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de localização.</p>
              ) : (
                <div className="space-y-2">
                  {stats.topNeighborhoods.map((n, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-purple-900">{n.name}</span>
                      <span className="text-muted-foreground">{n.count} clientes</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="border-purple-100">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-100">
            <Icon size={20} className="text-purple-700" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-purple-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
