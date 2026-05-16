import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone, Users, Instagram, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface EventBlock {
  key: string;
  name: string;
  formCount: number;
  igConnected: number;
}

const PROGRAM_EVENTS = [
  { key: 'lagun', name: 'Lagun' },
];

export default function InternoDivulgadores() {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<EventBlock[]>(
    PROGRAM_EVENTS.map((e) => ({ ...e, formCount: 0, igConnected: 0 }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [divRes, igRes] = await Promise.all([
        supabase
          .from('crm_customers')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('creator_instagram_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
      ]);
      const total = divRes.count ?? 0;
      const ig = igRes.count ?? 0;
      setBlocks((prev) =>
        prev.map((b) =>
          b.key === 'lagun' ? { ...b, formCount: total, igConnected: ig } : b
        )
      );
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Divulgadores por evento</h2>
          <p className="text-xs text-muted-foreground">Cadastros via formulário e contas conectadas ao Instagram.</p>
        </div>
        <button
          onClick={() => navigate('/interno/divulgadores/instagram')}
          className="text-xs px-3 py-1.5 rounded-md bg-pink-600 text-white hover:bg-pink-700 flex items-center gap-1"
        >
          <Instagram size={14} /> Painel Instagram
          <ExternalLink size={12} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {blocks.map((b) => (
          <Card
            key={b.key}
            className="border-border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/interno/divulgadores/instagram')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone size={14} className="text-[#FF0080]" />
                  {b.name}
                </div>
                <ChevronRight size={14} className="text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Users size={12} /> Cadastros
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {loading ? '—' : b.formCount < 0 ? '—' : b.formCount.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Instagram size={12} className="text-pink-500" /> Instagram conectado
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {loading ? '—' : b.igConnected.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
