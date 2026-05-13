import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Crown, Users, TrendingUp, Eye } from 'lucide-react';
import { formatPhone } from '@/lib/formatPhone';
import LoadingState from '@/components/interno/LoadingState';

interface Creator {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok: string | null;
  followers_instagram: number;
  followers_tiktok: number;
  video_skill: string;
  music_style: string;
  motivation: string;
  expected_value: number;
  qualification: string;
  qualification_score: number;
  city: string;
  created_at: string;
}

export default function CrmCreators() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  useEffect(() => {
    loadCreators();
  }, []);

  async function loadCreators() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('crm_creators')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCreators(data || []);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const altoPotencial = creators.filter(c => c.qualification.includes('Alto Potencial')).length;
  const potencial = creators.filter(c => c.qualification === '⚡ Potencial').length;

  const qualBadge = (q: string) => {
    if (q.includes('Alto Potencial')) return <Badge className="bg-orange-500 text-white text-xs">{q}</Badge>;
    if (q.includes('Potencial')) return <Badge className="bg-yellow-500 text-black text-xs">{q}</Badge>;
    return <Badge className="bg-gray-500 text-white text-xs">{q}</Badge>;
  };

  if (loading) return <LoadingState label="Creators" />;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100"><Users size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Inscrições</p>
                <p className="text-xl font-bold text-purple-900">{creators.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-100"><Crown size={20} className="text-orange-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">🔥 Alto Potencial</p>
                <p className="text-xl font-bold text-orange-700">{altoPotencial}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow-100"><TrendingUp size={20} className="text-yellow-700" /></div>
              <div>
                <p className="text-xs text-muted-foreground">⚡ Potencial</p>
                <p className="text-xl font-bold text-yellow-700">{potencial}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Modal */}
      {selectedCreator && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-purple-900 text-base">Detalhes: {selectedCreator.full_name}</CardTitle>
            <button onClick={() => setSelectedCreator(null)} className="text-sm text-purple-600 hover:underline">Fechar</button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium text-purple-800">Email:</span> {selectedCreator.email}</div>
            <div><span className="font-medium text-purple-800">WhatsApp:</span> {formatPhone(selectedCreator.whatsapp)}</div>
            <div><span className="font-medium text-purple-800">Instagram:</span> @{selectedCreator.instagram}</div>
            <div><span className="font-medium text-purple-800">TikTok:</span> @{selectedCreator.tiktok || '—'}</div>
            <div><span className="font-medium text-purple-800">Seguidores IG:</span> {selectedCreator.followers_instagram.toLocaleString('pt-BR')}</div>
            <div><span className="font-medium text-purple-800">Seguidores TK:</span> {selectedCreator.followers_tiktok.toLocaleString('pt-BR')}</div>
            <div><span className="font-medium text-purple-800">Grava/Edita:</span> {selectedCreator.video_skill}</div>
            <div><span className="font-medium text-purple-800">Estilo:</span> {selectedCreator.music_style}</div>
            <div><span className="font-medium text-purple-800">Valor esperado:</span> {fmt(selectedCreator.expected_value)}</div>
            <div><span className="font-medium text-purple-800">Qualificação:</span> {selectedCreator.qualification}</div>
            <div><span className="font-medium text-purple-800">Cidade:</span> {selectedCreator.city || '—'}</div>
            <div className="md:col-span-2"><span className="font-medium text-purple-800">Motivação:</span> {selectedCreator.motivation}</div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-purple-100">
        <CardHeader>
          <CardTitle className="text-purple-900 flex items-center gap-2 text-base">
            <Crown size={18} /> Candidatos a Creator
          </CardTitle>
        </CardHeader>
        <CardContent>
          {creators.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma inscrição ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Instagram</TableHead>
                    <TableHead className="text-center">Seguidores</TableHead>
                    <TableHead>Grava/Edita</TableHead>
                    <TableHead>Estilo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Qualificação</TableHead>
                    <TableHead className="text-center">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creators.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-purple-900">{c.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">@{c.instagram}</TableCell>
                      <TableCell className="text-center text-sm">
                        {(c.followers_instagram + c.followers_tiktok).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-sm">{c.video_skill}</TableCell>
                      <TableCell className="text-sm">{c.music_style}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(c.expected_value)}</TableCell>
                      <TableCell className="text-center">{qualBadge(c.qualification)}</TableCell>
                      <TableCell className="text-center">
                        <button onClick={() => setSelectedCreator(c)} className="text-purple-600 hover:text-purple-800">
                          <Eye size={16} />
                        </button>
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
