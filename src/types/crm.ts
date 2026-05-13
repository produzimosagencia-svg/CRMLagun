export interface CrmCustomer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  first_purchase: boolean;
  previous_purchases_count: number;
  ltv: number;
  last_event: string | null;
  preferred_event_type: string | null;
  classification: 'cold' | 'warm' | 'hot' | 'vip';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CrmPurchase {
  id: string;
  customer_id: string;
  event_name: string;
  event_date: string | null;
  ticket_type: string | null;
  ticket_lot: string | null;
  purchase_date: string;
  ticket_price: number;
  quantity: number;
  total_value: number;
  acquisition_channel: string | null;
  attendance_status: string;
  coupon_used: string | null;
  influencer_code: string | null;
  campaign_origin: string | null;
  campaign_medium: string | null;
  created_at: string;
}

export type ClientClassification = 'cold' | 'warm' | 'hot' | 'vip';

export const CLASSIFICATION_LABELS: Record<ClientClassification, string> = {
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
  vip: 'VIP',
};

export const CLASSIFICATION_COLORS: Record<ClientClassification, string> = {
  cold: 'bg-blue-100 text-blue-800',
  warm: 'bg-yellow-100 text-yellow-800',
  hot: 'bg-orange-100 text-orange-800',
  vip: 'bg-purple-100 text-purple-800',
};

export const EVENT_TYPES = ['Rap', 'Funk', 'Trap', 'Festival', 'Festa'];
export const TICKET_TYPES = ['Pista', 'VIP', 'Backstage', 'Camarote'];
export const TICKET_LOTS = ['1º Lote', '2º Lote', '3º Lote', '4º Lote', '5º Lote'];
export const ACQUISITION_CHANNELS = ['Instagram Ads', 'Influenciador', 'Orgânico', 'Direto', 'Indicação'];
export const CAMPAIGN_MEDIUMS = ['Ads', 'Orgânico', 'WhatsApp', 'Email', 'SMS'];
export const ATTENDANCE_STATUSES = ['Compareceu', 'Não Compareceu', 'Pendente'];
export const STATES_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
