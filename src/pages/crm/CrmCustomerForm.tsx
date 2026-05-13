import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { EVENT_TYPES, STATES_BR } from '@/types/crm';

export default function CrmCustomerForm() {
  const { id } = useParams();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    neighborhood: '',
    city: '',
    state: '',
    preferred_event_type: '',
    tags: '',
  });

  useEffect(() => {
    if (isEdit) loadCustomer();
  }, [id]);

  async function loadCustomer() {
    const { data } = await supabase.from('crm_customers').select('*').eq('id', id).single() as any;
    if (data) {
      setForm({
        full_name: data.full_name || '',
        email: data.email || '',
        phone: data.phone || '',
        neighborhood: data.neighborhood || '',
        city: data.city || '',
        state: data.state || '',
        preferred_event_type: data.preferred_event_type || '',
        tags: (data.tags || []).join(', '),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
      preferred_event_type: form.preferred_event_type || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };

    if (isEdit) {
      const { error } = await supabase.from('crm_customers').update(payload).eq('id', id) as any;
      if (error) toast.error(error.message);
      else {
        toast.success('Cliente atualizado!');
        navigate(`/interno/clientes/${id}`);
      }
    } else {
      const { data, error } = await supabase.from('crm_customers').insert(payload).select().single() as any;
      if (error) toast.error(error.message);
      else {
        toast.success('Cliente criado!');
        navigate(`/interno/clientes/${data.id}`);
      }
    }
    setSaving(false);
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} className="mr-1" /> Voltar
      </Button>

      <Card className="border-purple-100">
        <CardHeader>
          <CardTitle className="text-purple-900">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome Completo *</Label>
                <Input value={form.full_name} onChange={set('full_name')} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={set('phone')} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.neighborhood} onChange={set('neighborhood')} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={set('city')} />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <select value={form.state} onChange={set('state')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Selecione</option>
                  {STATES_BR.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Evento Preferido</Label>
                <select value={form.preferred_event_type} onChange={set('preferred_event_type')} className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">Selecione</option>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tags (separadas por vírgula)</Label>
                <Input value={form.tags} onChange={set('tags')} placeholder="ex: early-adopter, influencer" />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="bg-purple-700 hover:bg-purple-600 text-white">
              <Save size={16} className="mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
