import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import LoadingState from '@/components/interno/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, Receipt, TrendingUp, Trophy, Eye } from 'lucide-react';

interface ShopifyAnalytics {
  grossRevenue: number;
  netRevenue: number;
  totalItemsSold: number;
  totalOrders: number;
  avgTicket: number;
  topProducts: Array<{
    id: string;
    title: string;
    quantity: number;
    image: string | null;
  }>;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function InternoEcommerce() {
  const [data, setData] = useState<ShopifyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke('shopify-analytics');
        if (fnError) throw fnError;
        if (result?.error) throw new Error(result.error);
        setData(result);
      } catch (err: any) {
        console.error('Failed to fetch shopify analytics:', err);
        setError(err.message || 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) return <LoadingState label="e-commerce" />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-500 font-medium">Erro ao carregar dados do e-commerce</p>
        <p className="text-xs text-gray-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const metrics = [
    {
      label: 'Faturamento Bruto',
      value: formatBRL(data.grossRevenue),
      icon: DollarSign,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Peças Vendidas',
      value: data.totalItemsSold.toLocaleString('pt-BR'),
      icon: Package,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Ticket Médio por Pedido',
      value: formatBRL(data.avgTicket),
      icon: Receipt,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Faturamento Líquido',
      value: formatBRL(data.netRevenue),
      icon: TrendingUp,
      color: 'text-purple-600 bg-purple-50',
    },
  ];

  const topSeller = data.topProducts[0] || null;
  // For now, most visited = second most sold (Storefront API doesn't track views)
  const mostVisited = data.topProducts[1] || null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="border-gray-100">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${m.color}`}>
                  <m.icon size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                  <p className="text-lg font-bold text-gray-900 truncate">{m.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topSeller && (
          <Card className="border-gray-100 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Trophy size={16} className="text-amber-500" />
                Peça Mais Vendida
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4">
                {topSeller.image ? (
                  <img
                    src={topSeller.image}
                    alt={topSeller.title}
                    className="w-24 h-24 rounded-xl object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Package size={28} className="text-gray-300" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{topSeller.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {topSeller.quantity} {topSeller.quantity === 1 ? 'unidade vendida' : 'unidades vendidas'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {mostVisited && (
          <Card className="border-gray-100 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Eye size={16} className="text-blue-500" />
                Peça Mais Visitada
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4">
                {mostVisited.image ? (
                  <img
                    src={mostVisited.image}
                    alt={mostVisited.title}
                    className="w-24 h-24 rounded-xl object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Package size={28} className="text-gray-300" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{mostVisited.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {mostVisited.quantity} {mostVisited.quantity === 1 ? 'unidade vendida' : 'unidades vendidas'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* All top products ranking */}
      {data.topProducts.length > 2 && (
        <Card className="border-gray-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Ranking de Vendas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {data.topProducts.map((product, i) => (
                <div key={product.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}º</span>
                  {product.image ? (
                    <img src={product.image} alt={product.title} className="w-10 h-10 rounded-lg object-cover border border-gray-100" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Package size={16} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                    {product.quantity} un.
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
