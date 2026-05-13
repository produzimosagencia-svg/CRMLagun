import { useState } from 'react';
import { Navigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Users, LogOut, Menu, X, Crown, Mic, Music, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoTriade from '@/assets/logo-triade.png';

const navItems = [
  { to: '/crm', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/crm/rap-trap', label: 'RAP & TRAP', icon: Mic, end: false },
  { to: '/crm/pagode-funk', label: 'Pagode & Funk', icon: Music, end: false },
  { to: '/crm/customers', label: 'Clientes', icon: Users, end: false },
  { to: '/crm/superclientes', label: 'Superclientes', icon: Crown, end: false },
  { to: '/crm/creators', label: 'Creators', icon: Video, end: false },
];

export default function CrmLayout() {
  const { user, loading, isPartner, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-50">
        <div className="text-purple-800 text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user || !isPartner) {
    return <Navigate to="/crm/login" replace />;
  }

  return (
    <div className="min-h-screen flex bg-purple-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-purple-900 text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoTriade} alt="Tríade" className="h-8 brightness-0 invert" />
              <span className="font-bold text-lg">CRM</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-purple-300 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-700 text-white'
                      : 'text-purple-200 hover:bg-purple-800 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-purple-700">
            <p className="text-xs text-purple-300 mb-2 truncate">{user.email}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start text-purple-200 hover:text-white hover:bg-purple-800"
            >
              <LogOut size={16} className="mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-purple-100 px-4 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-purple-800">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold text-purple-900">
            {navItems.find(i => location.pathname === i.to || (!i.end && location.pathname.startsWith(i.to)))?.label ?? 'CRM'}
          </h1>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
