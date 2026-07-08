import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Clock, Send, ShoppingCart, RotateCcw, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DashboardStats {
  totalChats: number;
  chats24h: number;
  totalDispatches: number;
  purchasesByCoupon: number;
  recoveredCarts: number;
}

export default function InternoWhatsAppDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const { data: allChats } = await supabase
        .from('whatsapp_messages')
        .select('phone')
        .eq('direction', 'incoming');

      const uniquePhones = new Set(allChats?.map(m => m.phone) || []);
      const totalChats = uniquePhones.size;

      const { data: recentChats } = await supabase
        .from('whatsapp_messages')
        .select('phone')
        .eq('direction', 'incoming')
        .gte('timestamp', twentyFourHoursAgo);

      const uniqueRecent = new Set(recentChats?.map(m => m.phone) || []);
      const chats24h = uniqueRecent.size;

      const { count: dispatchCount } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
        .eq('message_type', 'template');

      const { data: cartMessages } = await supabase
        .from('whatsapp_messages')
        .select('phone, contact_name, timestamp')
        .eq('direction', 'outgoing')
        .or('message_text.ilike.%carrinho%,message_text.ilike.%abandonou%,message_text.ilike.%tentou realizar%');

      let recoveredCarts = 0;
      if (cartMessages && cartMessages.length > 0) {
        const cartPhones = [...new Set(cartMessages.map(m => m.phone))];
        for (const phone of cartPhones) {
          const normalizedPhone = phone.replace(/\D/g, '');
          const { data: customer } = await supabase
            .from('crm_customers')
            .select('id')
            .or(`phone.eq.${normalizedPhone},phone.eq.${phone}`)
            .limit(1)
            .maybeSingle();

          if (customer) {
            const msg = cartMessages.find(m => m.phone === phone);
            if (msg) {
              const { count } = await supabase
                .from('crm_purchases')
                .select('*', { count: 'exact', head: true })
                .eq('customer_id', customer.id)
                .gte('purchase_date', msg.timestamp.split('T')[0]);

              if (count && count > 0) recoveredCarts++;
            }
          }
        }
      }

      setStats({
        totalChats,
        chats24h,
        totalDispatches: dispatchCount || 0,
        purchasesByCoupon: 0,
        recoveredCarts,
      });
    } catch (err) {
      console.error('Error fetching WhatsApp dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    toast.success('Dados atualizados!');
  };

  const kpis = stats
    ? [
        {
          label: 'Chats Abertos',
          value: stats.totalChats.toLocaleString('pt-BR'),
          subtitle: 'Total de conversas',
          icon: MessageCircle,
          color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30',
        },
        {
          label: 'Chats (24h)',
          value: stats.chats24h.toLocaleString('pt-BR'),
          subtitle: new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
          icon: Clock,
          color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30',
        },
        {
          label: 'Disparos Feitos',
          value: stats.totalDispatches.toLocaleString('pt-BR'),
          subtitle: 'Templates enviados',
          icon: Send,
          color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30',
        },
        {
          label: 'Compras (Cupom)',
          value: stats.purchasesByCoupon.toLocaleString('pt-BR'),
          subtitle: 'Via cupom de desconto',
          icon: ShoppingCart,
          color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30',
        },
        {
          label: 'Carrinhos Recuperados',
          value: stats.recoveredCarts.toLocaleString('pt-BR'),
          subtitle: 'Conversões pós-disparo',
          icon: RotateCcw,
          color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30',
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard WhatsApp</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Visão geral dos seus canais e disparos
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-gray-500 dark:text-gray-400" onClick={handleRefresh}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span className="ml-1">Atualizar</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-gray-200 dark:border-[#32264a] bg-white dark:bg-[#1a1128] p-3.5 hover:border-gray-300 dark:hover:border-[#4b3a75] transition-all flex flex-col gap-2"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${kpi.color}`}>
              <kpi.icon size={13} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{kpi.value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{kpi.subtitle}</p>
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-[#32264a] bg-white dark:bg-[#1a1128] p-5">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">Campanhas de Disparo</h3>
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">Nenhuma campanha registrada</p>
          <p className="text-xs mt-1">As campanhas de disparo aparecerão aqui conforme forem criadas</p>
        </div>
      </div>
    </div>
  );
}
