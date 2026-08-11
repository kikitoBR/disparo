-- Execute esse SQL no painel do Supabase (SQL Editor)
-- para criar as tabelas do sistema de disparo.

-- 1. Contatos (chave única no telefone E.164)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) DEFAULT '',
  group_name VARCHAR(100) DEFAULT 'Geral',
  custom_fields JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Campanhas
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  message_template TEXT NOT NULL,
  group_filter VARCHAR(100),
  delay_min INTEGER DEFAULT 15,
  delay_max INTEGER DEFAULT 40,
  status VARCHAR(50) DEFAULT 'draft',
  total_targets INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  responded_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Logs de envio por contato
CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  phone_e164 VARCHAR(20) NOT NULL,
  rendered_message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  response_text TEXT,
  last_error TEXT
);

-- 4. Mensagens recebidas (inbound)
CREATE TABLE IF NOT EXISTS inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 VARCHAR(20) NOT NULL,
  message_text TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_e164);
CREATE INDEX IF NOT EXISTS idx_contacts_group ON contacts(group_name);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_phone ON campaign_logs(phone_e164);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status);
CREATE INDEX IF NOT EXISTS idx_inbound_phone ON inbound_messages(phone_e164);

-- Habilitar RLS (Row Level Security) - desabilitado para uso pessoal simples
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (uso pessoal - sem autenticação complexa)
CREATE POLICY "Allow all on contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on campaign_logs" ON campaign_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on inbound_messages" ON inbound_messages FOR ALL USING (true) WITH CHECK (true);
