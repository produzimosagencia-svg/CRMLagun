import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, User, Phone, Mail, Cake, Calendar, DollarSign } from 'lucide-react';
import { formatPhone } from '@/lib/formatPhone';

interface Props {
  customerId: string | null;
  onClose: () => void;
}

interface CustomerInfo {
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  city: string | null;
  state: string | null;
  ltv: number | null;
}

interface PurchaseRow {
  event_name: string;
  purchase_date: string | null;
  total_value: number;
  quantity: number;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return s;
  }
};

const fmtBirthday = (s: string | null) => {
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return s;
  }
};

export default function CustomerDetailsModal({ customerId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  useEffect(() => {
    if (!customerId) {
      setInfo(null);
      setPurchases([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const [c, p] = await Promise.all([
          supabase
            .from('crm_customers')
            .select('full_name,email,phone,birth_date,city,state,ltv')
            .eq('id', customerId)
            .maybeSingle(),
          supabase
            .from('crm_purchases')
            .select('event_name,purchase_date,event_date,total_value,quantity')
            .eq('customer_id', customerId)
            .order('purchase_date', { ascending: false }),
        ]);
        if (c.data) setInfo(c.data as CustomerInfo);
        if (p.data) {
          // agrupar por evento somando valores
          const grouped = new Map<string, PurchaseRow>();
          for (const row of p.data as any[]) {
            const key = row.event_name || 'Sem nome';
            const existing = grouped.get(key);
            if (existing) {
              existing.total_value += Number(row.total_value || 0);
              existing.quantity += Number(row.quantity || 1);
            } else {
              grouped.set(key, {
                event_name: key,
                purchase_date: row.event_date || row.purchase_date,
                total_value: Number(row.total_value || 0),
                quantity: Number(row.quantity || 1),
              });
            }
          }
          setPurchases(Array.from(grouped.values()).sort((a, b) => b.total_value - a.total_value));
        }
      } catch (e) {
        console.error('[CustomerDetailsModal] erro', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  const totalGasto = purchases.reduce((s, r) => s + r.total_value, 0);

  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User size={18} /> Detalhes do Cliente
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : !info ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cliente não encontrado.</p>
        ) : (
          <div className="space-y-5">
            {/* Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <User size={14} className="text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="font-medium">{info.full_name}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={14} className="text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Celular</p>
                  <p className="font-medium">{formatPhone(info.phone || '') || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail size={14} className="text-muted-foreground mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium truncate">{info.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Cake size={14} className="text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Aniversário</p>
                  <p className="font-medium">{fmtBirthday(info.birth_date)}</p>
                </div>
              </div>
              {(info.city || info.state) && (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <span className="text-xs text-muted-foreground mt-0.5">Localização:</span>
                  <p className="font-medium text-xs">
                    {[info.city, info.state].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar size={12} /> Eventos
                </div>
                <p className="text-lg font-bold mt-1">{purchases.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <DollarSign size={12} /> Total Gasto
                </div>
                <p className="text-lg font-bold mt-1 text-emerald-600">{fmt(totalGasto)}</p>
              </div>
            </div>

            {/* Eventos */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Eventos & gastos</h3>
              {purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead className="text-center">Ingressos</TableHead>
                        <TableHead className="text-right">Gasto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{p.event_name}</TableCell>
                          <TableCell className="text-center text-sm">{p.quantity}</TableCell>
                          <TableCell className="text-right font-semibold text-sm">{fmt(p.total_value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
