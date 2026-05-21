import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EventDashboard } from './InternoBluetick';
import { Loader2 } from 'lucide-react';

const LE_BAI_NAMES = ['le bai', 'lebai', 'le-bai', "le'bai", 'le’bai'];

export default function InternoLeBai() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findEvent() {
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

      // Ainda sem webhooks — renderiza dashboard com ID fallback (mostra zeros)
      setEventId('40935');
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

  return <EventDashboard eventId={eventId!} />;
}
