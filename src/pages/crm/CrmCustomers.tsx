import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Download, Filter } from 'lucide-react';
import type { CrmCustomer, ClientClassification } from '@/types/crm';
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/types/crm';
import { formatPhone } from '@/lib/formatPhone';
import LoadingState from '@/components/interno/LoadingState';

export default function CrmCustomers() {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterClassification, setFilterClassification] = useState<ClientClassification | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const eventParam = searchParams.get('event');
    if (eventParam) {
      setFilterEvent(eventParam);
      setShowFilters(true);
    }
    loadCustomers();
  }, [searchParams]);

  async function loadCustomers() {
    // Paginate past 1000-row limit
    const all: CrmCustomer[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1) as any;
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setCustomers(all);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const q = search.toLowerCase();
      const matchesSearch = !q || 
        c.full_name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q));
      const matchesEvent = !filterEvent || c.last_event?.toLowerCase().includes(filterEvent.toLowerCase());
      const matchesCity = !filterCity || c.city?.toLowerCase().includes(filterCity.toLowerCase());
      const matchesClass = !filterClassification || c.classification === filterClassification;
      return matchesSearch && matchesEvent && matchesCity && matchesClass;
    });
  }, [customers, search, filterEvent, filterCity, filterClassification]);

  function exportCSV() {
    const headers = ['Nome', 'Email', 'Telefone', 'Bairro', 'Cidade', 'Estado', 'Compras', 'LTV', 'Classificação', 'Último Evento', 'Tags'];
    const rows = filtered.map(c => [
      c.full_name, c.email || '', c.phone || '', c.neighborhood || '', c.city || '', c.state || '',
      c.previous_purchases_count, c.ltv, CLASSIFICATION_LABELS[c.classification], c.last_event || '', (c.tags || []).join('; ')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-triade-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} className="mr-1" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={16} className="mr-1" /> CSV
          </Button>
          <Button size="sm" onClick={() => navigate('/interno/clientes/novo')} className="bg-[#FF0080] hover:bg-[#E0006F] text-white">
            <Plus size={16} className="mr-1" /> Novo Cliente
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="border-purple-100">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input placeholder="Filtrar por evento" value={filterEvent} onChange={e => setFilterEvent(e.target.value)} />
              <Input placeholder="Filtrar por cidade" value={filterCity} onChange={e => setFilterCity(e.target.value)} />
              <select
                value={filterClassification}
                onChange={e => setFilterClassification(e.target.value as ClientClassification | '')}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Todas classificações</option>
                <option value="cold">Frio</option>
                <option value="warm">Morno</option>
                <option value="hot">Quente</option>
                <option value="vip">VIP</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-purple-100">
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Clientes" />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {customers.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum resultado encontrado.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden md:table-cell">Telefone</TableHead>
                    <TableHead className="hidden lg:table-cell">Cidade</TableHead>
                    <TableHead>Compras</TableHead>
                    <TableHead>LTV</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead className="hidden lg:table-cell">Último Evento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-purple-50"
                      onClick={() => navigate(`/interno/clientes/${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{c.email || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{formatPhone(c.phone)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{c.city || '—'}</TableCell>
                      <TableCell>{c.previous_purchases_count}</TableCell>
                      <TableCell className="font-medium">
                        {Number(c.ltv).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${CLASSIFICATION_COLORS[c.classification]}`}>
                          {CLASSIFICATION_LABELS[c.classification]}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{c.last_event || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">{filtered.length} cliente(s) encontrado(s)</p>
    </div>
  );
}
