import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, TrendingUp } from 'lucide-react';
import { formatPhone } from '@/lib/formatPhone';
import LoadingState from '@/components/interno/LoadingState';
import CustomerDetailsModal from '@/components/interno/CustomerDetailsModal';

interface SuperCliente {
  customer_id: string;
  full_name: string;
  phone: string | null;
  total_spent: number;
  event_count: number;
  event_names: string[] | null;
}

export default function CrmSuperclientes() {
  const [superClientes, setSuperClientes] = useState<SuperCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc('crm_top_superclientes', { lim: 20 });
        if (error) throw error;
        const rows: SuperCliente[] = (data || []).map((r: any) => ({
          customer_id: r.customer_id,
          full_name: r.full_name,
          phone: r.phone,
          total_spent: Number(r.total_spent || 0),
          event_count: Number(r.event_count || 0),
          event_names: r.event_names || [],
        }));
        setSuperClientes(rows);
      } catch (e) {
        console.error('[Superclientes] erro ao carregar', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const totalReceita = superClientes.reduce((s, c) => s + c.total_spent, 0);

  if (loading) return <LoadingState label="Superclientes" />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100"><Crown size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Top Superclientes (LTV ≥ R$1.000)</p>
                <p className="text-xl font-bold text-purple-900">{superClientes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100"><TrendingUp size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Receita do Top 20</p>
                <p className="text-xl font-bold text-purple-900">{fmt(totalReceita)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100"><Star size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Média por Cliente</p>
                <p className="text-xl font-bold text-purple-900">
                  {superClientes.length > 0 ? fmt(totalReceita / superClientes.length) : 'R$ 0,00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-purple-100">
        <CardHeader>
          <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
            <Crown size={18} /> Top 20 Superclientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {superClientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum supercliente encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-center">Eventos</TableHead>
                  <TableHead className="text-center">Quais Eventos</TableHead>
                  <TableHead className="text-right">LTV</TableHead>
                  <TableHead className="text-center">Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {superClientes.map((sc, idx) => {
                  const isSuperVip = sc.event_count >= 3;
                  return (
                    <TableRow key={sc.customer_id} className={isSuperVip ? 'bg-purple-50 border-l-4 border-l-purple-600' : ''}>
                      <TableCell className="font-bold text-purple-400">{idx + 1}</TableCell>
                      <TableCell className={`font-medium ${isSuperVip ? 'text-purple-900 font-bold' : 'text-purple-900'}`}>
                        {isSuperVip && <Crown size={14} className="inline mr-1 text-purple-600 -mt-0.5" />}
                        <button
                          onClick={() => setDetailsId(sc.customer_id)}
                          className="text-left hover:underline"
                        >
                          {sc.full_name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPhone(sc.phone || '')}</TableCell>
                      <TableCell className="text-center">{sc.event_count}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(sc.event_names || []).map((e, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-purple-200 text-purple-700">
                              {e.length > 25 ? e.slice(0, 25) + '…' : e}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-purple-700">{fmt(sc.total_spent)}</TableCell>
                      <TableCell className="text-center">
                        {isSuperVip ? (
                          <Badge className="bg-purple-600 text-white">SUPERVIP</Badge>
                        ) : (
                          <Badge className="bg-purple-100 text-purple-800">VIP</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <CustomerDetailsModal customerId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}
