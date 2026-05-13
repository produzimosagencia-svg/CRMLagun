import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import LoadingState from '@/components/interno/LoadingState';
import type { CrmCustomer, CrmPurchase } from '@/types/crm';
import {
  CLASSIFICATION_LABELS, CLASSIFICATION_COLORS, TICKET_TYPES, TICKET_LOTS,
  ACQUISITION_CHANNELS, CAMPAIGN_MEDIUMS, ATTENDANCE_STATUSES
} from '@/types/crm';
import { formatPhone } from '@/lib/formatPhone';

export default function CrmCustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CrmCustomer | null>(null);
  const [purchases, setPurchases] = useState<CrmPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    event_name: '', event_date: '', ticket_type: '', ticket_lot: '',
    purchase_date: new Date().toISOString().slice(0, 10), ticket_price: '', quantity: '1',
    acquisition_channel: '', attendance_status: 'Pendente',
    coupon_used: '', influencer_code: '', campaign_origin: '', campaign_medium: '',
  });
  const [savingPurchase, setSavingPurchase] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('crm_customers').select('*').eq('id', id).single() as any,
      supabase.from('crm_purchases').select('*').eq('customer_id', id).order('purchase_date', { ascending: false }) as any,
    ]);
    setCustomer(c);
    setPurchases(p || []);
    setLoading(false);
  }

  async function handleAddPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!purchaseForm.event_name.trim()) { toast.error('Nome do evento é obrigatório'); return; }
    setSavingPurchase(true);
    const price = parseFloat(purchaseForm.ticket_price) || 0;
    const qty = parseInt(purchaseForm.quantity) || 1;
    const { error } = await supabase.from('crm_purchases').insert({
      customer_id: id,
      event_name: purchaseForm.event_name.trim(),
      event_date: purchaseForm.event_date || null,
      ticket_type: purchaseForm.ticket_type || null,
      ticket_lot: purchaseForm.ticket_lot || null,
      purchase_date: purchaseForm.purchase_date,
      ticket_price: price,
      quantity: qty,
      total_value: price * qty,
      acquisition_channel: purchaseForm.acquisition_channel || null,
      attendance_status: purchaseForm.attendance_status || 'Pendente',
      coupon_used: purchaseForm.coupon_used || null,
      influencer_code: purchaseForm.influencer_code || null,
      campaign_origin: purchaseForm.campaign_origin || null,
      campaign_medium: purchaseForm.campaign_medium || null,
    }) as any;
    if (error) toast.error(error.message);
    else {
      toast.success('Compra registrada!');
      setShowPurchaseForm(false);
      setPurchaseForm({
        event_name: '', event_date: '', ticket_type: '', ticket_lot: '',
        purchase_date: new Date().toISOString().slice(0, 10), ticket_price: '', quantity: '1',
        acquisition_channel: '', attendance_status: 'Pendente',
        coupon_used: '', influencer_code: '', campaign_origin: '', campaign_medium: '',
      });
      loadData();
    }
    setSavingPurchase(false);
  }

  async function handleDeleteCustomer() {
    if (!confirm('Tem certeza que deseja excluir este cliente e todas as suas compras?')) return;
    const { error } = await supabase.from('crm_customers').delete().eq('id', id) as any;
    if (error) toast.error(error.message);
    else {
      toast.success('Cliente excluído!');
      navigate('/interno/clientes');
    }
  }

  if (loading) return <LoadingState label="Cliente" />;
  if (!customer) return <div>Cliente não encontrado.</div>;

  const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const daysSince = Math.floor((Date.now() - new Date(customer.updated_at).getTime()) / (1000 * 60 * 60 * 24));

  const pf = purchaseForm;
  const setPf = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPurchaseForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/interno/clientes')}>
          <ArrowLeft size={16} className="mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/interno/clientes/${id}/editar`)}>
            <Edit size={16} className="mr-1" /> Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteCustomer}>
            <Trash2 size={16} className="mr-1" /> Excluir
          </Button>
        </div>
      </div>

      {/* Customer Info */}
      <Card className="border-purple-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-purple-900">{customer.full_name}</CardTitle>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${CLASSIFICATION_COLORS[customer.classification]}`}>
              {CLASSIFICATION_LABELS[customer.classification]}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <Info label="Email" value={customer.email} />
            <Info label="Telefone" value={formatPhone(customer.phone)} />
            <Info label="Bairro" value={customer.neighborhood} />
            <Info label="Cidade" value={customer.city} />
            <Info label="Estado" value={customer.state} />
            <Info label="Tipo Preferido" value={customer.preferred_event_type} />
            <Info label="Total de Compras" value={String(customer.previous_purchases_count)} />
            <Info label="LTV" value={fmt(customer.ltv)} />
            <Info label="Último Evento" value={customer.last_event} />
            <Info label="Dias desde última compra" value={String(daysSince)} />
            <Info label="Primeira compra?" value={customer.first_purchase ? 'Sim' : 'Não'} />
          </div>
          {customer.tags && customer.tags.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {customer.tags.map((t, i) => (
                  <span key={i} className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">{t}</span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchases */}
      <Card className="border-purple-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-purple-900 text-base">Histórico de Compras</CardTitle>
            <Button size="sm" onClick={() => setShowPurchaseForm(!showPurchaseForm)} className="bg-purple-700 hover:bg-purple-600 text-white">
              <Plus size={16} className="mr-1" /> Nova Compra
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showPurchaseForm && (
            <form onSubmit={handleAddPurchase} className="mb-6 p-4 border border-purple-200 rounded-lg space-y-4 bg-purple-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Evento *</Label>
                  <Input value={pf.event_name} onChange={setPf('event_name')} required placeholder="Ex: BoomRAP" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data do Evento</Label>
                  <Input type="date" value={pf.event_date} onChange={setPf('event_date')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Ingresso</Label>
                  <select value={pf.ticket_type} onChange={setPf('ticket_type')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                    <option value="">Selecione</option>
                    {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Lote</Label>
                  <select value={pf.ticket_lot} onChange={setPf('ticket_lot')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                    <option value="">Selecione</option>
                    {TICKET_LOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data da Compra</Label>
                  <Input type="date" value={pf.purchase_date} onChange={setPf('purchase_date')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor Unitário (R$)</Label>
                  <Input type="number" step="0.01" value={pf.ticket_price} onChange={setPf('ticket_price')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" min="1" value={pf.quantity} onChange={setPf('quantity')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Canal de Aquisição</Label>
                  <select value={pf.acquisition_channel} onChange={setPf('acquisition_channel')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                    <option value="">Selecione</option>
                    {ACQUISITION_CHANNELS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comparecimento</Label>
                  <select value={pf.attendance_status} onChange={setPf('attendance_status')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                    {ATTENDANCE_STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cupom</Label>
                  <Input value={pf.coupon_used} onChange={setPf('coupon_used')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Código Influenciador</Label>
                  <Input value={pf.influencer_code} onChange={setPf('influencer_code')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campanha</Label>
                  <Input value={pf.campaign_origin} onChange={setPf('campaign_origin')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Meio da Campanha</Label>
                  <select value={pf.campaign_medium} onChange={setPf('campaign_medium')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                    <option value="">Selecione</option>
                    {CAMPAIGN_MEDIUMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingPurchase} size="sm" className="bg-purple-700 hover:bg-purple-600 text-white">
                  {savingPurchase ? 'Salvando...' : 'Salvar Compra'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPurchaseForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}

          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Data Evento</TableHead>
                    <TableHead>Ingresso</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.event_name}</TableCell>
                      <TableCell>{p.event_date || '—'}</TableCell>
                      <TableCell>{[p.ticket_type, p.ticket_lot].filter(Boolean).join(' / ') || '—'}</TableCell>
                      <TableCell>{p.quantity}</TableCell>
                      <TableCell className="font-medium">{fmt(p.total_value)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.acquisition_channel || '—'}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          p.attendance_status === 'Compareceu' ? 'bg-green-100 text-green-800' :
                          p.attendance_status === 'Não Compareceu' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {p.attendance_status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-purple-900">{value || '—'}</p>
    </div>
  );
}
