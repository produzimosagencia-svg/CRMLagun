import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Palette, Image, TrendingUp, Trophy, Sparkles, Send, Mail,
  MessageCircle, Users, ChevronLeft, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface SubCard {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bg: string;
  to: string;
}

interface MainOption {
  key: string;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bg: string;
  directTo?: string;
  subCards?: SubCard[];
}

const mainOptions: MainOption[] = [
  {
    key: 'crm',
    icon: Users,
    label: 'CRM',
    description: 'Gestão de clientes e leads',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    directTo: '/interno/eventos',
  },
  {
    key: 'tarefas',
    icon: ClipboardList,
    label: 'Tarefas',
    description: 'Gestão de tarefas do time',
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    directTo: '/interno/tarefas',
  },
  {
    key: 'performance',
    icon: TrendingUp,
    label: 'Performance',
    description: 'Campanhas, criativos e disparos',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    subCards: [
      { icon: TrendingUp, label: 'Campanhas', description: 'Relatórios de tráfego pago.', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', to: '/interno/ads/campanhas' },
      { icon: Trophy, label: 'Criativos Campeões', description: 'Melhores criativos.', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', to: '/interno/ads/criativos' },
{ icon: Send, label: 'Disparo WhatsApp', description: 'Disparo em massa via WhatsApp.', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', to: '/interno/whatsapp' },
      { icon: Mail, label: 'Disparo de E-mail', description: 'Campanhas de e-mail marketing.', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', to: '/interno/email' },
    ],
  },
  {
    key: 'atendimento',
    icon: MessageCircle,
    label: 'Atendimento',
    description: 'Chat com clientes',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    directTo: '/interno/whatsapp/chat',
  },
  {
    key: 'criacao',
    icon: Palette,
    label: 'Criação',
    description: 'Design e referências visuais',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    subCards: [
      { icon: Palette, label: 'Design', description: 'Briefings e demandas visuais.', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', to: '/interno/marketing/design' },
      { icon: Image, label: 'Referências', description: 'Banco de referências criativas.', color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20', to: '/interno/marketing/referencias' },
    ],
  },
];

interface EventCountdown {
  name: string;
  date: Date;
}

const upcomingEvents: EventCountdown[] = [
  { name: 'Maestria', date: new Date('2026-05-09T00:00:00-03:00') },
  { name: 'Bloco do Bero', date: new Date('2026-07-19T00:00:00-03:00') },
];

function useCountdowns(events: EventCountdown[]) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return events.map((ev) => {
    const diff = Math.max(0, ev.date.getTime() - now.getTime());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { ...ev, days, hours, minutes, seconds, diff };
  });
}

export default function InternoDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const countdowns = useCountdowns(upcomingEvents);

  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata;
    if (meta?.full_name) {
      setFirstName((meta.full_name as string).split(' ')[0]);
      return;
    }
    supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setFirstName(data.full_name.split(' ')[0]);
        }
      });
  }, [user]);

  const handleMainClick = (option: MainOption) => {
    if (option.directTo) {
      navigate(option.directTo);
      return;
    }
    setExpanded(expanded === option.key ? null : option.key);
  };

  const expandedOption = mainOptions.find((o) => o.key === expanded);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center w-full max-w-3xl -mt-12"
          >
            {/* Greeting */}
            <div className="text-center mb-10">
              <span className="text-5xl sm:text-6xl block mb-3">👋</span>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
                Fala, {firstName || 'amigo'}!
              </h1>
              <p className="text-xl sm:text-2xl text-gray-400 dark:text-gray-500 mt-2">
                O que vamos fazer hoje?
              </p>
            </div>

            {/* Main options */}
            <div className="flex gap-4 justify-center w-full">
              {mainOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleMainClick(option)}
                  className="group flex flex-col items-center gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 w-40 sm:w-44 transition-all hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-700 hover:-translate-y-1"
                >
                  <div className={`p-4 rounded-xl ${option.bg}`}>
                    <option.icon size={28} className={option.color} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Event countdowns */}
            <div className="mt-12 flex flex-col gap-6 items-center">
              {countdowns.map((ev) => (
                <div key={ev.name} className="flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {ev.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {String(ev.days).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">dias</span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 text-lg font-light">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {String(ev.hours).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">hrs</span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 text-lg font-light">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {String(ev.minutes).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">min</span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 text-lg font-light">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {String(ev.seconds).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">seg</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sub"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center w-full max-w-4xl -mt-12"
          >
            <button
              onClick={() => setExpanded(null)}
              className="flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-8 self-start"
            >
              <ChevronLeft size={18} />
              <span className="text-sm font-medium">Voltar</span>
            </button>

            <div className="text-center mb-8">
              <div className={`inline-flex p-4 rounded-xl ${expandedOption?.bg} mb-3`}>
                {expandedOption && <expandedOption.icon size={32} className={expandedOption.color} />}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                {expandedOption?.label}
              </h2>
            </div>

            <div className="flex gap-4 justify-center flex-wrap">
              {expandedOption?.subCards?.map((card) => (
                <button
                  key={card.label}
                  onClick={() => navigate(card.to)}
                  className="group flex flex-col items-center gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 w-40 sm:w-44 transition-all hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-700 hover:-translate-y-1"
                >
                  <div className={`p-4 rounded-xl ${card.bg}`}>
                    <card.icon size={28} className={card.color} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                      {card.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
