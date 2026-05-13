import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Video, Megaphone, Palette, CalendarDays, Target, BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';

const cards = [
  {
    icon: Video,
    label: 'Creators',
    description: 'Gerenciar criadores de conteúdo e suas qualificações.',
    glowColor: 'pink' as const,
    to: '/interno/marketing/creators',
  },
  {
    icon: Megaphone,
    label: 'Divulgadores',
    description: 'Acompanhar e gerenciar divulgadores de eventos.',
    glowColor: 'orange' as const,
    to: '/interno/marketing/divulgadores',
  },
  {
    icon: Palette,
    label: 'Referências',
    description: 'Banco de referências criativas para campanhas.',
    glowColor: 'blue' as const,
    to: '/interno/marketing/referencias',
  },
  {
    icon: Palette,
    label: 'Design',
    description: 'Briefar ou fazer demandas de design para eventos.',
    glowColor: 'purple' as const,
    to: '/interno/marketing/design',
  },
  {
    icon: CalendarDays,
    label: 'Social Media',
    description: 'Calendário de publicações por evento.',
    glowColor: 'blue' as const,
    to: '/interno/marketing/social-media',
  },
  {
    icon: Target,
    label: 'Campanhas',
    description: 'Planejar a estratégia das próximas campanhas.',
    glowColor: 'green' as const,
    to: '/interno/marketing/campanhas',
  },
  {
    icon: BarChart3,
    label: 'Relatórios',
    description: 'Relatórios de performance das campanhas.',
    glowColor: 'orange' as const,
    to: '/interno/marketing/relatorios',
  },
];

export default function InternoMarketing() {
  const navigate = useNavigate();
  const location = useLocation();

  const isSubRoute = location.pathname !== '/interno/marketing';
  if (isSubRoute) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
      <h2 className="text-xl font-semibold text-gray-900 mb-8">Marketing</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {cards.map((card) => (
          <Card
            key={card.label}
            onClick={() => navigate(card.to)}
            className="flex cursor-pointer flex-col items-start gap-3 border-border bg-card p-5 text-left transition-all hover:border-muted-foreground/20 hover:bg-muted/30 hover:shadow-sm"
          >
            <div className={`p-2.5 rounded-lg ${
              card.glowColor === 'pink' ? 'bg-pink-500/10 text-pink-500' :
              card.glowColor === 'orange' ? 'bg-amber-500/10 text-amber-500' :
              card.glowColor === 'blue' ? 'bg-blue-500/10 text-blue-500' :
              card.glowColor === 'purple' ? 'bg-purple-500/10 text-purple-500' :
              card.glowColor === 'green' ? 'bg-emerald-500/10 text-emerald-500' :
              'bg-orange-500/10 text-orange-500'
            }`}>
              <card.icon size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{card.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{card.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
