import { useEffect, useState, useRef } from 'react';
import { Send, Upload, Image as ImageIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import triadeLogo from '@/assets/logo-lagun-entretenimento.png';

interface TemplateData {
  imageUrl: string;
  title: string;
  copy: string;
  buttonText: string;
  buttonColor: string;
  buttonLink: string;
  subject: string;
  recipients: string;
}

const defaultTemplate: TemplateData = {
  imageUrl: '',
  title: 'Título do E-mail',
  copy: 'Escreva aqui o texto do seu e-mail marketing. Personalize a mensagem para engajar seu público.',
  buttonText: 'SAIBA MAIS',
  buttonColor: '#3b82f6',
  buttonLink: '',
  subject: '',
  recipients: '',
};

const colorPresets = [
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Roxo', value: '#D9B14E' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Preto', value: '#111111' },
  { label: 'Dourado', value: '#d4a853' },
];

export default function EmailTemplateBuilder() {
  const [template, setTemplate] = useState<TemplateData>(defaultTemplate);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvRecipients, setCsvRecipients] = useState<{ name: string; email: string }[]>([]);
  const [crmEvents, setCrmEvents] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [isLoadingCrmEvents, setIsLoadingCrmEvents] = useState(true);

  useEffect(() => {
    const loadCrmEvents = async () => {
      setIsLoadingCrmEvents(true);
      const allNames = new Set<string>();
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('crm_customers')
          .select('last_event')
          .not('last_event', 'is', null)
          .order('last_event')
          .range(from, from + pageSize - 1);

        if (error) {
          toast.error('Não foi possível carregar os eventos do CRM.');
          setIsLoadingCrmEvents(false);
          return;
        }

        if (!data || data.length === 0) break;
        data.forEach((item) => {
          if (item.last_event) allNames.add(item.last_event);
        });
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setCrmEvents([...allNames].sort((a, b) => a.localeCompare(b)));
      setIsLoadingCrmEvents(false);
    };

    loadCrmEvents();
  }, []);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV vazio ou sem dados.'); return; }
      const recipients = lines.slice(1).map(line => {
        const parts = line.split(/[,;]/).map(s => s.trim().replace(/^"|"$/g, ''));
        return { name: parts[0] || '', email: parts[1] || '' };
      }).filter(r => r.email && r.email.includes('@'));
      setCsvRecipients(recipients);
      toast.success(`${recipients.length} destinatários carregados!`);
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTemplate((prev) => ({ ...prev, imageUrl: url }));
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="flex gap-6 items-start">
      {/* Left: Form */}
      <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novo Disparo de E-mail</h2>

        <div className="space-y-4">
          {/* Recipients */}
          <div>
            <label className={labelClass}>Destinatários — Eventos do CRM</label>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">Selecione um ou mais eventos para disparar para o público deles.</p>
            <div className="grid gap-2 max-h-52 overflow-y-auto">
              {isLoadingCrmEvents && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">Carregando eventos do CRM...</p>
              )}
              {!isLoadingCrmEvents && crmEvents.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">Nenhum evento encontrado no CRM.</p>
              )}
              {!isLoadingCrmEvents && crmEvents.map((eventName) => {
                const active = selectedEvents.includes(eventName);
                return (
                  <button
                    key={eventName}
                    type="button"
                    onClick={() => setSelectedEvents((prev) => active ? prev.filter((item) => item !== eventName) : [...prev, eventName])}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span>🎫</span>
                      <span>{eventName}</span>
                    </span>
                    <span>{active ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
            {selectedEvents.length > 0 && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1.5">{selectedEvents.length} evento(s) selecionado(s)</p>
            )}
          </div>

          {/* CSV Upload */}
          <div>
            <label className={labelClass}>Ou importe uma planilha CSV</label>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              onClick={() => csvInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full justify-center"
            >
              <Upload size={16} />
              {csvRecipients.length > 0 ? `📄 ${csvRecipients.length} destinatários carregados` : 'Fazer upload do CSV'}
            </button>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Formato: 2 colunas — <strong>nome</strong> e <strong>email</strong>.
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className={labelClass}>Assunto do E-mail</label>
            <input
              type="text"
              value={template.subject}
              onChange={(e) => setTemplate((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Ex: Não perca esse evento! 🔥"
              className={inputClass}
            />
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Conteúdo do Template</p>

          {/* Image Upload */}
          <div>
            <label className={labelClass}>Imagem (1080×1350)</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full justify-center"
            >
              {template.imageUrl ? (
                <>
                  <ImageIcon size={16} />
                  Trocar imagem
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Fazer upload da imagem
                </>
              )}
            </button>
          </div>

          {/* Title */}
          <div>
            <label className={labelClass}>Título</label>
            <input
              type="text"
              value={template.title}
              onChange={(e) => setTemplate((p) => ({ ...p, title: e.target.value }))}
              placeholder="Título principal do e-mail"
              className={inputClass}
            />
          </div>

          {/* Copy */}
          <div>
            <label className={labelClass}>Copy</label>
            <textarea
              value={template.copy}
              onChange={(e) => setTemplate((p) => ({ ...p, copy: e.target.value }))}
              placeholder="Texto descritivo do e-mail"
              rows={3}
              className={inputClass + ' resize-none'}
            />
          </div>

          {/* Button text */}
          <div>
            <label className={labelClass}>Texto do Botão</label>
            <input
              type="text"
              value={template.buttonText}
              onChange={(e) => setTemplate((p) => ({ ...p, buttonText: e.target.value }))}
              placeholder="COMPRAR AGORA"
              className={inputClass}
            />
          </div>

          {/* Button link */}
          <div>
            <label className={labelClass}>Link do Botão</label>
            <input
              type="url"
              value={template.buttonLink}
              onChange={(e) => setTemplate((p) => ({ ...p, buttonLink: e.target.value }))}
              placeholder="https://exemplo.com/ingresso"
              className={inputClass}
            />
          </div>

          {/* Button color */}
          <div>
            <label className={labelClass}>Cor do Botão</label>
            <div className="flex items-center gap-2 flex-wrap">
              {colorPresets.map((c) => (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={() => setTemplate((p) => ({ ...p, buttonColor: c.value }))}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    template.buttonColor === c.value ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <input
                type="color"
                value={template.buttonColor}
                onChange={(e) => setTemplate((p) => ({ ...p, buttonColor: e.target.value }))}
                className="w-7 h-7 rounded-full cursor-pointer border-0 p-0"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              <Send size={16} />
              Disparar E-mails
            </button>
            <button className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Agendar
            </button>
            <button
              onClick={() => toast.success('Template salvo com sucesso!')}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save size={16} />
              Salvar Template
            </button>
          </div>
        </div>
      </div>

      {/* Right: iPhone Preview */}
      <div className="flex flex-col items-center gap-3 sticky top-6">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Preview</p>
        <IPhoneFrame template={template} />
      </div>
    </div>
  );
}

function IPhoneFrame({ template }: { template: TemplateData }) {
  return (
    <div className="relative w-[300px]">
      {/* iPhone outer shell */}
      <div className="relative bg-black rounded-[40px] p-[10px] shadow-2xl">
        {/* Notch / Dynamic Island */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90px] h-[28px] bg-black rounded-b-2xl z-20" />

        {/* Screen */}
        <div className="relative bg-gray-800 rounded-[30px] overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-white text-[10px] font-medium">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="white"><rect x="0" y="4" width="3" height="6" rx="0.5"/><rect x="4" y="2" width="3" height="8" rx="0.5"/><rect x="8" y="0" width="3" height="10" rx="0.5"/></svg>
              <svg width="14" height="10" viewBox="0 0 24 14" fill="white"><path d="M1 5a4 4 0 014-4h14a4 4 0 014 4v4a4 4 0 01-4 4H5a4 4 0 01-4-4V5z" stroke="white" strokeWidth="1" fill="none"/><rect x="3" y="3" width="16" height="8" rx="2" fill="white"/></svg>
            </div>
          </div>

          {/* Email content area */}
          <div className="bg-[#3a3a3a] min-h-[520px] flex flex-col">
            {/* Header with logo */}
            <div className="flex items-center justify-between px-5 py-4">
              <img src={triadeLogo} alt="Tríade" className="h-5 brightness-0 invert" />
              <span className="text-[8px] text-gray-400 uppercase tracking-widest font-medium">
                E-mail Marketing
              </span>
            </div>

            {/* Image */}
            <div className="px-4">
              {template.imageUrl ? (
                <img
                  src={template.imageUrl}
                  alt="Template"
                  className="w-full aspect-[1080/1350] object-cover rounded-xl"
                />
              ) : (
                <div className="w-full aspect-[1080/1350] bg-gray-600 rounded-xl flex items-center justify-center">
                  <ImageIcon size={32} className="text-gray-400" />
                </div>
              )}
            </div>

            {/* Title */}
            <div className="px-5 pt-4">
              <h3 className="text-white font-bold text-base leading-tight">{template.title || 'Título'}</h3>
            </div>

            {/* Copy */}
            <div className="px-5 pt-2">
              <p className="text-gray-300 text-[11px] leading-relaxed">{template.copy || 'Texto descritivo...'}</p>
            </div>

            {/* Button */}
            <div className="px-5 pt-4 pb-6">
              <div
                className="w-full py-3 rounded-lg text-center text-white text-[11px] font-semibold uppercase tracking-wider border border-white/20"
                style={{ backgroundColor: template.buttonColor }}
              >
                {template.buttonText || 'BOTÃO'}
              </div>
            </div>
          </div>

          {/* Home indicator */}
          <div className="bg-gray-800 flex justify-center py-2">
            <div className="w-28 h-1 bg-gray-500 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
