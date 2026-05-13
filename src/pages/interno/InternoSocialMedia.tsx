import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EventOption {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface Demand {
  id: string;
  title: string;
  publish_date: string | null;
  status: string;
  event_id: string;
}

export default function InternoSocialMedia() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    supabase.from('events').select('id, name, avatar_url').order('name').then(({ data }) => {
      const evts = data || [];
      setEvents(evts);
      if (evts.length > 0) setSelectedEvent(evts[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    supabase.from('design_demands').select('id, title, publish_date, status, event_id')
      .eq('event_id', selectedEvent)
      .then(({ data }) => setDemands(data || []));
  }, [selectedEvent]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const demandsByDate = useMemo(() => {
    const map = new Map<string, Demand[]>();
    demands.forEach(d => {
      if (!d.publish_date) return;
      const key = d.publish_date;
      map.set(key, [...(map.get(key) || []), d]);
    });
    return map;
  }, [demands]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const selectedEvt = events.find(e => e.id === selectedEvent);

  const statusDot: Record<string, string> = {
    pendente: 'bg-yellow-400',
    'em andamento': 'bg-blue-400',
    aprovado: 'bg-emerald-400',
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 border-2 border-[#FF0080] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/interno/marketing')}>
          <ArrowLeft size={16} className="mr-1" /> Marketing
        </Button>
        <h2 className="text-sm font-semibold text-gray-900">Social Media</h2>
      </div>

      {/* Event selector */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => setSelectedEvent(ev.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all shrink-0
              ${selectedEvent === ev.id ? 'border-[#FF0080] bg-[#FF0080]/5 text-[#FF0080]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}
            `}
          >
            <Avatar className="h-6 w-6">
              {ev.avatar_url ? <AvatarImage src={ev.avatar_url} /> : null}
              <AvatarFallback className="text-[8px] font-bold bg-gray-100">{ev.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            {ev.name}
          </button>
        ))}
      </div>

      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft size={16} /></Button>
        <h3 className="text-sm font-semibold text-gray-900 capitalize">{monthName}</h3>
        <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight size={16} /></Button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-2 border-b border-gray-100">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {/* Empty cells for first week offset */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDemands = demandsByDate.get(dateStr) || [];
            const isToday = new Date().toISOString().slice(0, 10) === dateStr;

            return (
              <div key={day} className={`min-h-[80px] border-b border-r border-gray-50 p-1.5 ${isToday ? 'bg-[#FF0080]/5' : ''}`}>
                <span className={`text-xs font-medium ${isToday ? 'text-[#FF0080] font-bold' : 'text-gray-500'}`}>{day}</span>
                <div className="mt-1 space-y-0.5">
                  {dayDemands.map(d => (
                    <div key={d.id} className="flex items-center gap-1 text-[10px] text-gray-700 bg-gray-50 rounded px-1 py-0.5 truncate">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[d.status] || 'bg-gray-300'}`} />
                      <span className="truncate">{d.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
