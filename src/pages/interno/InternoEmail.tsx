import { useState } from 'react';
import { Mail, Send, Users, FileText, Plus, Search, MoreHorizontal, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import EmailTemplateBuilder from '@/components/interno/EmailTemplateBuilder';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'active';
  lastUsed?: string;
}

const mockTemplates: EmailTemplate[] = [];

interface EmailLog {
  id: string;
  template: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sentAt: string;
}

const mockLogs: EmailLog[] = [];

const statusConfig = {
  sent: { label: 'Enviado', color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30', icon: Clock },
  delivered: { label: 'Entregue', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30', icon: AlertCircle },
  pending: { label: 'Pendente', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30', icon: Clock },
};

export default function InternoEmail() {
  const [activeTab, setActiveTab] = useState<'templates' | 'disparos' | 'logs'>('disparos');
  const [search, setSearch] = useState('');

  const stats = [
    { label: 'E-mails Enviados', value: '0', icon: Send, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Taxa de Abertura', value: '0%', icon: Mail, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Taxa de Clique', value: '0%', icon: FileText, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Destinatários', value: '0', icon: Users, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30' },
  ];

  const tabs = [
    { key: 'templates' as const, label: 'Templates' },
    { key: 'disparos' as const, label: 'Novo Disparo' },
    { key: 'logs' as const, label: 'Disparos em Massa' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white dark:bg-[#1A1916] border border-gray-200 dark:border-[#2A2822] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
                <s.icon size={20} className={s.color} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#242320] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab.key
                ? 'bg-white dark:bg-[#242320] text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Templates tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar template..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-[#34322B] rounded-lg bg-white dark:bg-[#1A1916] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 w-64 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus size={16} />
              Novo Template
            </button>
          </div>

          <div className="grid gap-3">
            {mockTemplates
              .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
              .map((template) => (
                <div
                  key={template.id}
                  className="bg-white dark:bg-[#1A1916] border border-gray-200 dark:border-[#2A2822] rounded-xl p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{template.name}</h3>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            template.status === 'active'
                              ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-[#242320] text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {template.status === 'active' ? 'Ativo' : 'Rascunho'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300">Assunto:</span> {template.subject}
                      </p>
                      {template.lastUsed && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">Último uso: {template.lastUsed}</p>
                      )}
                    </div>
                    <button className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#242320] text-gray-400 dark:text-gray-500">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Novo Disparo tab */}
      {activeTab === 'disparos' && <EmailTemplateBuilder />}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-[#1A1916] border border-gray-200 dark:border-[#2A2822] rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Nenhum disparo em massa ainda</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Quando você começar a disparar campanhas, elas vão aparecer aqui.</p>
        </div>
      )}
    </div>
  );
}
