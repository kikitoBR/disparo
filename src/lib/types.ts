export interface Contact {
  id: string;
  phone_e164: string;
  name: string;
  group_name: string;
  custom_fields: Record<string, string>;
  status: 'active' | 'opt_out' | 'blacklisted';
  created_at: string;
}

export interface Campaign {
  id: string;
  title: string;
  message_template: string;
  group_filter: string | null;
  delay_min: number;
  delay_max: number;
  status: 'draft' | 'running' | 'paused' | 'completed';
  total_targets: number;
  sent_count: number;
  failed_count: number;
  responded_count: number;
  created_at: string;
}

export interface CampaignLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  phone_e164: string;
  rendered_message: string;
  status: 'pending' | 'sent' | 'failed' | 'responded' | 'cancelled';
  sent_at: string | null;
  response_at: string | null;
  response_text: string | null;
  last_error: string | null;
  contact_name?: string;
}
