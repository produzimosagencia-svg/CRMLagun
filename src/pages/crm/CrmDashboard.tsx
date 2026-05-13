import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, Ticket, TrendingUp, MapPin, BarChart3, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { CrmCustomer, CrmPurchase } from '@/types/crm';
import LoadingState from '@/components/interno/LoadingState';

interface DashboardStats {
  totalCustomers: number;
  totalRevenue: number;
  averageTicket: number;
  netProfit: number;
  topEvents: { name: string; count: number; revenue: number }[];
  topCities: { name: string; count: number }[];
  topNeighborhoods: { name: string; count: number }[];
}

// Fetch all rows from a table, paginating past the 1000-row limit
async function fetchAll(table: string): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any).from(table).select('*').range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function CrmDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const [customers, purchases] = await Promise.all([
      fetchAll('crm_customers'),
      fetchAll('crm_purchases'),
    ]);

    // Count only customers who have at least one purchase
    const customerIdsWithPurchases = new Set(purchases.map((p: any) => p.customer_id));
    const totalCustomers = customerIdsWithPurchases.size;
    const totalRevenue = purchases.reduce((s, p) => s + Number(p.total_value), 0);
    const averageTicket = purchases.length > 0 ? totalRevenue / purchases.length : 0;
    const netProfit = 0;

    // Top events
    const eventMap = new Map<string, { count: number; revenue: number }>();
    purchases.forEach(p => {
      const curr = eventMap.get(p.event_name) || { count: 0, revenue: 0 };
      curr.count++;
      curr.revenue += Number(p.total_value);
      eventMap.set(p.event_name, curr);
    });
    const topEvents = Array.from(eventMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top cities
    const cityMap = new Map<string, number>();
    customers.forEach(c => {
      if (c.city) cityMap.set(c.city, (cityMap.get(c.city) || 0) + 1);
    });
    const topCities = Array.from(cityMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top neighborhoods
    const nbMap = new Map<string, number>();
    customers.forEach(c => {
      if (c.neighborhood) nbMap.set(c.neighborhood, (nbMap.get(c.neighborhood) || 0) + 1);
    });
    const topNeighborhoods = Array.from(nbMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setStats({ totalCustomers, totalRevenue, averageTicket, netProfit, topEvents, topCities, topNeighborhoods });
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-superticket');
      if (error) throw error;
      toast.success(`Sincronização concluída! ${data.customersCreated} novos clientes, ${data.purchasesCreated} novas compras.`);
      loadStats();
    } catch (err: any) {
      toast.error(`Erro na sincronização: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const eventName = prompt('Nome do evento (ex: "BoomRAP Festival 2025"):');
    if (!eventName) return;

    const category = prompt('Categoria (rap_trap ou pagode_funk):');
    if (!category || !['rap_trap', 'pagode_funk'].includes(category)) {
      toast.error('Categoria inválida. Use "rap_trap" ou "pagode_funk".');
      return;
    }

    setImporting(true);
    setImportProgress('Lendo planilha...');

    try {
      // Parse XLSX in the browser
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const allRows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
      let totalCreated = 0, totalUpdated = 0, totalPurchases = 0, totalSkipped = 0;

      const { data: { session } } = await supabase.auth.getSession();

      for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        setImportProgress(`Processando lote ${chunkNum}/${totalChunks} (${Math.min(i + CHUNK_SIZE, allRows.length)}/${allRows.length} linhas)...`);

        const chunk = allRows.slice(i, i + CHUNK_SIZE);
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-rows`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event_name: eventName,
              event_category: i === 0 ? category : undefined,
              rows: chunk,
            }),
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        totalCreated += result.customersCreated || 0;
        totalUpdated += result.customersUpdated || 0;
        totalPurchases += result.purchasesCreated || 0;
        totalSkipped += result.skipped || 0;
      }

      toast.success(
        `Importação concluída! ${totalCreated} novos clientes, ${totalUpdated} atualizados, ${totalPurchases} compras, ${totalSkipped} ignorados.`
      );
      loadStats();
    } catch (err: any) {
      toast.error(`Erro na importação: ${err.message}`);
    } finally {
      setImporting(false);
      setImportProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (loading) return <LoadingState label="Dashboard" />;
  if (!stats) return <div className="text-purple-800">Erro ao carregar dados.</div>;

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileImport}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50"
        >
          <Upload size={16} className={`mr-2 ${importing ? 'animate-pulse' : ''}`} />
          {importing ? (importProgress || 'Importando...') : 'Importar Planilha'}
        </Button>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-purple-700 hover:bg-purple-600 text-white"
        >
          <RefreshCw size={16} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar SuperTicket'}
        </Button>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total de Clientes" value={stats.totalCustomers.toString()} />
        <StatCard icon={DollarSign} label="Receita Total" value={fmt(stats.totalRevenue)} />
        <StatCard icon={Ticket} label="Ticket Médio" value={fmt(stats.averageTicket)} />
        <StatCard icon={TrendingUp} label="Lucro Líquido" value={fmt(stats.netProfit)} />
      </div>

      {/* Top Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-purple-100">
          <CardHeader>
            <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
              <BarChart3 size={18} /> Eventos com Mais Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
            ) : (
              <div className="space-y-3">
                {stats.topEvents.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-purple-900">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.count} vendas</p>
                    </div>
                    <span className="font-semibold text-sm text-purple-700">{fmt(e.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
                <MapPin size={18} /> Principais Cidades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topCities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
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
                <p className="text-sm text-muted-foreground">Sem dados.</p>
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
