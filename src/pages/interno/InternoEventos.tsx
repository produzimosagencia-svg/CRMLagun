import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, Ticket, Zap } from 'lucide-react';

interface EventPlatform {
  name: string;
  path: string;
  icon: React.ReactNode;
  description: string;
  connected: boolean;
  color: string;
}

export default function InternoEventos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState({
    lebai: null as any,
    aura: null as any,
    zigTickets: [] as any[],
  });

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data: logs } = await supabase
          .from('webhook_logs')
          .select('payload, source')
          .in('source', ['blueticket', 'zig_tickets']);

        if (logs) {
          const lebaiEvent = logs.find(
            (log) =>
              log.source === 'blueticket' &&
              (log.payload?.payload?.event?.name ?? '')
                .toLowerCase()
                .includes('le bai')
          );

          const auraEvent = logs.find(
            (log) =>
              log.source === 'blueticket' &&
              (log.payload?.payload?.event?.name ?? '')
                .toLowerCase()
                .includes('aura')
          );

          const zigEvents = logs
            .filter((log) => log.source === 'zig_tickets')
            .map((log) => ({
              id: log.payload?.payload?.event?.id,
              name: log.payload?.payload?.event?.name,
            }))
            .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);

          setEvents({
            lebai: lebaiEvent?.payload?.payload?.event,
            aura: auraEvent?.payload?.payload?.event,
            zigTickets: zigEvents,
          });
        }
      } catch (error) {
        console.error('Error loading events:', error);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
      </div>
    );
  }

  const platforms: EventPlatform[] = [
    {
      name: 'Le Bai',
      path: '/interno/lebai',
      icon: <Ticket size={24} className="text-blue-500" />,
      description: events.lebai?.name || 'Gerenciar eventos Le Bai',
      connected: true,
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    },
    {
      name: 'Aura',
      path: '/interno/aura',
      icon: <Zap size={24} className="text-amber-500" />,
      description: events.aura?.name || 'Gerenciar eventos Aura',
      connected: true,
      color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    },
    {
      name: 'Zig Tickets',
      path: '/interno/zig-tickets',
      icon: <Ticket size={24} className="text-purple-500" />,
      description: `${events.zigTickets.length} evento${events.zigTickets.length !== 1 ? 's' : ''} cadastrado${events.zigTickets.length !== 1 ? 's' : ''}`,
      connected: true,
      color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    },
    {
      name: 'Bero Costa',
      path: '#',
      icon: <AlertCircle size={24} className="text-red-500" />,
      description: 'API não conectada',
      connected: false,
      color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Todas as Plataformas
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Visualize e gerencie eventos de todas as suas plataformas de ticketing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {platforms.map((platform) => (
          <button
            key={platform.name}
            onClick={() => {
              if (platform.connected) {
                navigate(platform.path);
              }
            }}
            disabled={!platform.connected}
            className={`p-4 rounded-lg border-2 transition-all ${
              platform.connected
                ? `${platform.color} hover:shadow-lg cursor-pointer`
                : `${platform.color} cursor-not-allowed opacity-75`
            }`}
          >
            <div className="flex items-center justify-center mb-3">
              {platform.icon}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              {platform.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {platform.description}
            </p>
            {!platform.connected && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                Desconectada
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
