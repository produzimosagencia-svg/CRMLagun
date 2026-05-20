import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EventDashboard } from './InternoBluetick';
import { Loader2, Ticket } from 'lucide-react';

// Possíveis nomes do evento Le Bai na Blueticket (case-insensitive)
const LE_BAI_NAMES = ['le bai', 'lebai', 'le-bai'];

export default function InternoLeBai() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findEvent() {
      // Busca paginada nos logs da Blueticket
      const allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('webhook_logs')
          .select('payload')
          .eq('source', 'blueticket')
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      for (const log of allData) {
        const name: string = (log.payload?.payload?.event?.name ?? '').toLowerCase();
        const id = log.payload?.payload?.event?.id?.toString();
        if (id && LE_BAI_NAMES.some(n => name.includes(n))) {
          setEventId(id);
          setLoading(false);
          return;
        }
      }

      setLoading(false);
    }
    findEvent();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400">
          <Ticket size={26} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Nenhum dado recebido ainda para o Le Bai</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
            Assim que a Blueticket enviar o primeiro webhook de venda ou carrinho abandonado, o dashboard aparecerá aqui automaticamente.
          </p>
        </div>
      </div>
    );
  }

  return <EventDashboard eventId={eventId} />;
}
