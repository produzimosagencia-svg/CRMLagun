import { useState, useEffect } from 'react';
import { Navigate, Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Home, LogOut, Menu, X, Mail,
  ChevronsRight, Ticket, Radio, MessageCircle, Send,
  ChevronDown, ChevronRight, Settings, User, Moon, Sun, Zap, Sparkles,
  Megaphone, BarChart3, Trophy, Users, ClipboardList, Palette, Image, Share2, Cake,
  Database, Plus,
} from 'lucide-react';
import { MetaIcon } from '@/components/icons/MetaIcon';
import { supabase } from '@/integrations/supabase/client';
import logoLagun from '@/assets/logo-lagun-entretenimento.png';
import logoBlueticket from '@/assets/blueticket-icon.png';
import logoMailchimp from '@/assets/mailchimp-icon.png';

interface EventItem {
  id: string;
  name: string;
}

export default function InternoLayout() {
  const { user, loading, isPartner, isAdmin, roles, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('interno-theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [blueticketOpen, setBluetickOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [zigTicketsOpen, setZigTicketsOpen] = useState(false);
  const [adsOpen, setAdsOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [onlineEvents, setOnlineEvents] = useState<EventItem[]>([]);
  const [zigEvents, setZigEvents] = useState<EventItem[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('interno-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    supabase
      .from('webhook_logs')
      .select('payload, source')
      .in('source', ['blueticket', 'zig_tickets'])
      .then(({ data }) => {
        if (!data) return;
        const btEventsMap = new Map<string, string>();
        const zigEventsMap = new Map<string, string>();
        for (const row of data) {
          const p = (row.payload as any)?.payload;
          if (p?.event?.id && p?.event?.name) {
            if (row.source === 'blueticket') {
              btEventsMap.set(String(p.event.id), p.event.name);
            } else if (row.source === 'zig_tickets') {
              zigEventsMap.set(String(p.event.id), p.event.name);
            }
          }
        }
        const predefined = [{ id: '99901', name: 'Sambinha' }];
        predefined.forEach(pe => {
          if (!Array.from(btEventsMap.values()).some(n => n.toLowerCase() === pe.name.toLowerCase())) {
            btEventsMap.set(pe.id, pe.name);
          }
        });
        setOnlineEvents(Array.from(btEventsMap, ([id, name]) => ({ id, name })));
        const zigPredefined = [{ id: '99902', name: 'Maestria' }];
        zigPredefined.forEach(pe => {
          if (!Array.from(zigEventsMap.values()).some(n => n.toLowerCase() === pe.name.toLowerCase())) {
            zigEventsMap.set(pe.id, pe.name);
          }
        });
        setZigEvents(Array.from(zigEventsMap, ([id, name]) => ({ id, name })));
      });
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/interno/whatsapp')) setWhatsappOpen(true);
    if (location.pathname.startsWith('/interno/blueticket')) setBluetickOpen(true);
    if (location.pathname.startsWith('/interno/zig-tickets')) setZigTicketsOpen(true);
    if (location.pathname.startsWith('/interno/ads') || location.pathname.startsWith('/interno/trafego-gpt')) setAdsOpen(true);
    if (location.pathname.startsWith('/interno/marketing/design') || location.pathname.startsWith('/interno/marketing/referencias')) setDesignOpen(true);
    if (
      location.pathname === '/interno/eventos' ||
      location.pathname.startsWith('/interno/aniversariantes') ||
      location.pathname.startsWith('/interno/divulgadores') ||
      location.pathname.startsWith('/interno/superclientes')
    ) setCrmOpen(true);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isPartner) {
    return <Navigate to="/interno/login" replace />;
  }

  const userName = user.user_metadata?.full_name
    ? (user.user_metadata.full_name as string).split(' ')[0]
    : user.email?.split('@')[0] ?? 'Usuário';

  // Role-based visibility
  const hasDesignRole = roles.includes('design');
  const hasTrafegoRole = roles.includes('trafego');
  const isFullAccess = isAdmin || (!hasDesignRole && !hasTrafegoRole);
  const canSeeHome = isFullAccess;
  const canSeeCRM = isFullAccess;
  const canSeeWhatsApp = isFullAccess || hasTrafegoRole;
  const canSeeBluetick = isFullAccess;
  const canSeeZigTickets = isFullAccess;
  const canSeeAds = isFullAccess || hasTrafegoRole;
  const canSeeEmail = isFullAccess;
  const canSeeDesign = isFullAccess || hasDesignRole;
  const canSeeGrafos = isFullAccess;

  // Redirect design-only users away from routes they can't access
  if (hasDesignRole && !isFullAccess) {
    const designAllowed = ['/interno/marketing/design', '/interno/marketing/referencias', '/interno/perfil'];
    const isAllowed = designAllowed.some((p) => location.pathname.startsWith(p));
    if (!isAllowed) {
      return <Navigate to="/interno/marketing/design" replace />;
    }
  }

  const getPageTitle = () => {
    if (location.pathname.startsWith('/interno/trafego-gpt')) return 'TráfegoGPT';
    if (location.pathname === '/interno/ads/campanhas') return 'Campanhas';
    if (location.pathname === '/interno/ads/criativos') return 'Criativos Campeões';
    if (location.pathname === '/interno/ads/criar') return 'Nova Campanha';
    if (location.pathname === '/interno/ads/pixel') return 'Pixel & Públicos';
    if (location.pathname.startsWith('/interno/ads')) return 'Ads';
    if (location.pathname === '/interno/eventos') return 'CRM';
    if (location.pathname === '/interno/tarefas') return 'Tarefas';
    if (location.pathname === '/interno/whatsapp/chat') return 'Chat';
    if (location.pathname.startsWith('/interno/whatsapp')) return 'WhatsApp';
    if (location.pathname.startsWith('/interno/blueticket')) return 'Blueticket';
    if (location.pathname.startsWith('/interno/zig-tickets')) return 'Zig Tickets';
    if (location.pathname.startsWith('/interno/marketing/design')) return 'Design';
    if (location.pathname.startsWith('/interno/marketing/referencias')) return 'Referências';
    if (location.pathname.startsWith('/interno/perfil')) return 'Perfil';
    if (location.pathname.startsWith('/interno/grafos')) return 'RMKT (Grafos)';
    if (location.pathname.startsWith('/interno/dados')) return 'Dados';
    if (location.pathname === '/interno') return 'Home';
    return 'Interno';
  };

  const isActiveRoute = (path: string, end = false) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const navLinkClass = (active: boolean) =>
    `relative flex h-10 w-full items-center rounded-md transition-all duration-200 ${
      collapsed ? 'justify-center px-0' : 'px-3'
    } ${
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm border-l-2 border-blue-500'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
    }`;

  const subItemClass = (active: boolean) =>
    `flex h-8 w-full items-center rounded-md px-3 pl-9 text-xs font-medium transition-all duration-200 ${
      active
        ? 'text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-900/20'
        : 'text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`;

  const isHome = location.pathname === '/interno';

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950">
      {sidebarOpen && !isHome && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 flex flex-col h-screen bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 lg:translate-x-0
          ${isHome ? '-translate-x-full lg:-translate-x-full lg:hidden' : sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-[60px]' : 'w-[225px]'}
        `}
      >
        <div className={`mb-1 border-b border-gray-200 dark:border-gray-800 p-3 flex justify-center`}>
          <div className="flex items-center justify-center">
            <img
              src={logoLagun}
              alt="Lagun"
              className={`rounded transition-all ${collapsed ? 'h-7 w-7 object-contain' : 'h-9'}`}
            />
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-3 right-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2 overflow-y-auto">
          {/* Home removida — login vai direto para CRM */}

          {/* Design-only: Design & Referências */}
          {canSeeDesign && !canSeeHome && (
            <>
              <NavLink
                to="/interno/marketing/design"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => navLinkClass(isActive)}
                title={collapsed ? 'Design' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Megaphone size={18} />
                </div>
                {!collapsed && <span className="text-sm font-medium">Design</span>}
              </NavLink>
              <NavLink
                to="/interno/marketing/referencias"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => navLinkClass(isActive)}
                title={collapsed ? 'Referências' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Sparkles size={18} />
                </div>
                {!collapsed && <span className="text-sm font-medium">Referências</span>}
              </NavLink>
            </>
          )}

          {/* 2. CRM (com sub-itens) */}
          {canSeeCRM && (
            <div>
              <button
                onClick={() => {
                  if (collapsed) {
                    navigate('/interno/eventos');
                    setSidebarOpen(false);
                  } else {
                    setCrmOpen((v) => !v);
                  }
                }}
                className={navLinkClass(location.pathname === '/interno/eventos' || location.pathname.startsWith('/interno/aniversariantes') || location.pathname.startsWith('/interno/divulgadores'))}
                title={collapsed ? 'CRM' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Users size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">CRM</span>
                    {crmOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>
                )}
              </button>

              {!collapsed && crmOpen && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink
                    to="/interno/eventos"
                    end
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <span className="text-xs">Visão geral</span>
                  </NavLink>
                  <NavLink
                    to="/interno/aniversariantes"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <Cake size={14} className="mr-2" />
                    <span className="text-xs">Aniversariantes</span>
                  </NavLink>
                  <NavLink
                    to="/interno/divulgadores"
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => navLinkClass(isActive) + ' text-xs'}
                  >
                    <Megaphone size={14} className="mr-2" />
                    <span className="text-xs">Divulgadores</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* 2.5. Tarefas */}
          <NavLink
            to="/interno/tarefas"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navLinkClass(isActive)}
            title={collapsed ? 'Tarefas' : undefined}
          >
            <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
              <ClipboardList size={18} />
            </div>
            {!collapsed && <span className="text-sm font-medium">Tarefas</span>}
          </NavLink>

          {/* 2.7. Grafos */}
          {canSeeGrafos && (
            <NavLink
              to="/interno/grafos"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'RMKT (Grafos)' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Share2 size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">RMKT (Grafos)</span>}
            </NavLink>
          )}

          {/* Dados removido do sidebar */}

          {/* 2.6. Chat (WhatsApp + Instagram) */}
          {canSeeWhatsApp && (
            <NavLink
              to="/interno/whatsapp/chat"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Chat' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <MessageCircle size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Chat</span>}
            </NavLink>
          )}

          {/* 3. WhatsApp */}
          {canSeeWhatsApp && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/whatsapp'); }
                  else { setWhatsappOpen(!whatsappOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/whatsapp') && !isActiveRoute('/interno/whatsapp/chat'))}
                title={collapsed ? 'WhatsApp' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Send size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">WhatsApp</span>
                    <ChevronRight size={14} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${whatsappOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {whatsappOpen && !collapsed && (
                <div className="space-y-0.5">
                  <NavLink to="/interno/whatsapp/dashboard" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <BarChart3 size={14} className="mr-2" /> Dashboard
                  </NavLink>
                  <NavLink to="/interno/whatsapp" end onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Send size={14} className="mr-2" /> Disparo
                  </NavLink>
                </div>
              )}
            </>
          )}

          {/* 4. Blueticket */}
          {canSeeBluetick && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/blueticket'); }
                  else { setBluetickOpen(!blueticketOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/blueticket'))}
                title={collapsed ? 'Blueticket' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <img src={logoBlueticket} alt="Blueticket" width={18} height={18} style={{ objectFit: 'contain', filter: 'grayscale(1) brightness(0.6) contrast(1.2)' }} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Blueticket</span>
                    <ChevronRight size={14} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${blueticketOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {blueticketOpen && !collapsed && (
                <div className="space-y-0.5">
                  {onlineEvents.length === 0 && (
                    <span className="block px-3 pl-9 text-[11px] text-gray-400 dark:text-gray-600 py-1">Nenhum evento online</span>
                  )}
                  {onlineEvents.map((ev) => (
                    <NavLink key={ev.id} to={`/interno/blueticket/${ev.id}`} onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                      <Ticket size={14} className="mr-2 shrink-0" />
                      <span className="truncate">{ev.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 5. Zig Tickets */}
          {canSeeZigTickets && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/zig-tickets'); }
                  else { setZigTicketsOpen(!zigTicketsOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/zig-tickets'))}
                title={collapsed ? 'Zig Tickets' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Zap size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Zig Tickets</span>
                    <ChevronRight size={14} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${zigTicketsOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {zigTicketsOpen && !collapsed && (
                <div className="space-y-0.5">
                  {zigEvents.length === 0 && (
                    <span className="block px-3 pl-9 text-[11px] text-gray-400 dark:text-gray-600 py-1">Nenhum evento online</span>
                  )}
                  {zigEvents.map((ev) => (
                    <NavLink key={ev.id} to={`/interno/zig-tickets/${ev.id}`} onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                      <Ticket size={14} className="mr-2 shrink-0" />
                      <span className="truncate">{ev.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 6. Ads */}
          {canSeeAds && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/ads/campanhas'); }
                  else { setAdsOpen(!adsOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/ads') || isActiveRoute('/interno/trafego-gpt'))}
                title={collapsed ? 'Ads' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <MetaIcon size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Ads</span>
                    <ChevronRight size={14} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${adsOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {adsOpen && !collapsed && (
                <div className="space-y-0.5">
                  <NavLink to="/interno/ads/campanhas" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <BarChart3 size={14} className="mr-2" /> Campanhas
                  </NavLink>
                  <NavLink to="/interno/ads/criar" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Plus size={14} className="mr-2" /> Criar Campanha
                  </NavLink>
                  <NavLink to="/interno/ads/pixel" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Radio size={14} className="mr-2" /> Pixel & Públicos
                  </NavLink>
                  <NavLink to="/interno/ads/criativos" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Trophy size={14} className="mr-2" /> Criativos Campeões
                  </NavLink>
                  <NavLink to="/interno/trafego-gpt" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Sparkles size={14} className="mr-2" /> TráfegoGPT
                  </NavLink>
                </div>
              )}
            </>
          )}

          {/* 7. Mailchimp */}
          {canSeeEmail && (
            <NavLink
              to="/interno/email"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Mailchimp' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <img src={logoMailchimp} alt="Mailchimp" width={18} height={18} className="object-contain dark:invert" />
              </div>
              {!collapsed && <span className="text-sm font-medium">Mailchimp</span>}
            </NavLink>
          )}

          {/* 7.5. Design */}
          {canSeeDesign && (
            <>
              <button
                onClick={() => {
                  if (collapsed) { navigate('/interno/marketing/design'); }
                  else { setDesignOpen(!designOpen); }
                }}
                className={navLinkClass(isActiveRoute('/interno/marketing/design') || isActiveRoute('/interno/marketing/referencias'))}
                title={collapsed ? 'Design' : undefined}
              >
                <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                  <Palette size={18} />
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">Design</span>
                    <ChevronRight size={14} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${designOpen ? 'rotate-90' : ''}`} />
                  </>
                )}
              </button>
              {designOpen && !collapsed && (
                <div className="space-y-0.5">
                  <NavLink to="/interno/marketing/design" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Palette size={14} className="mr-2" /> Demandas
                  </NavLink>
                  <NavLink to="/interno/marketing/referencias" onClick={() => setSidebarOpen(false)} className={({ isActive }) => subItemClass(isActive)}>
                    <Image size={14} className="mr-2" /> Referências
                  </NavLink>
                </div>
              )}
            </>
          )}

          {/* 8. Admin */}
          {isAdmin && (
            <NavLink
              to="/interno/admin"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
              title={collapsed ? 'Admin' : undefined}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
                <Settings size={18} />
              </div>
              {!collapsed && <span className="text-sm font-medium">Admin</span>}
            </NavLink>
          )}

          {/* 9. Perfil */}
          <NavLink
            to="/interno/perfil"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navLinkClass(isActive)}
            title={collapsed ? 'Perfil' : undefined}
          >
            <div className={`flex items-center justify-center ${collapsed ? '' : 'mr-2'}`}>
              <User size={18} />
            </div>
            {!collapsed && <span className="text-sm font-medium">Perfil</span>}
          </NavLink>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-gray-200 dark:border-gray-800">
          {!collapsed && (
            <div className="px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">{userName}</span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                      {isAdmin ? 'Admin' : hasDesignRole ? 'Design' : hasTrafegoRole ? 'Gestor de Tráfego' : 'Parceiro'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={signOut}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors"
                >
                  <LogOut size={12} />
                  Sair
                </button>
              </div>
            </div>
          )}

          <div className={`flex items-center border-t border-gray-200 dark:border-gray-800 ${collapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`flex items-center justify-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${
                collapsed ? 'w-full py-2.5' : 'flex-1 py-2.5'
              }`}
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
              {!collapsed && <span className="text-[11px]">{isDark ? 'Claro' : 'Escuro'}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`hidden lg:flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${
                collapsed ? 'w-full py-2.5' : 'flex-1 py-2.5 border-l border-gray-200 dark:border-gray-800'
              }`}
              title={collapsed ? 'Expandir' : 'Recolher'}
            >
              <ChevronsRight size={14} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!isHome && (
          <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-4 h-12 flex items-center gap-3 lg:px-6">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <Menu size={20} />
            </button>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {getPageTitle()}
            </h1>
          </header>
        )}

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
