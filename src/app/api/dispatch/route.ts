import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { renderTemplate } from '@/lib/utils';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

// POST /api/dispatch — Executa o disparo de uma campanha
export async function POST(request: NextRequest) {
  const { campaign_id } = await request.json();

  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id é obrigatório.' }, { status: 400 });
  }

  // Busca a campanha
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
  }

  // Busca os contatos alvo
  let query = supabase.from('contacts').select('*').eq('status', 'active');
  if (campaign.group_filter && campaign.group_filter !== 'Todos') {
    query = query.eq('group_name', campaign.group_filter);
  }
  const { data: contacts, error: contactsError } = await query;

  if (contactsError || !contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'Nenhum contato encontrado para o filtro.' }, { status: 400 });
  }

  // Marca a campanha como running
  await supabase
    .from('campaigns')
    .update({ status: 'running', total_targets: contacts.length })
    .eq('id', campaign_id);

  // Cria os logs pendentes
  const logs = contacts.map((contact) => {
    const variables: Record<string, string> = {
      nome: contact.name || '',
      telefone: contact.phone_e164,
      grupo: contact.group_name || '',
      ...(contact.custom_fields || {}),
    };
    return {
      campaign_id,
      contact_id: contact.id,
      phone_e164: contact.phone_e164,
      rendered_message: renderTemplate(campaign.message_template, variables),
      status: 'pending',
    };
  });

  await supabase.from('campaign_logs').insert(logs);

  // Disparo sequencial com delays aleatórios
  let sentCount = 0;
  let failedCount = 0;

  for (const log of logs) {
    // Delay aleatório entre envios
    const delay = Math.floor(
      Math.random() * (campaign.delay_max - campaign.delay_min + 1) + campaign.delay_min
    );
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));

    // Verifica se a campanha foi pausada
    const { data: currentCampaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaign_id)
      .single();

    if (currentCampaign?.status === 'paused') {
      // Cancela os pendentes
      await supabase
        .from('campaign_logs')
        .update({ status: 'cancelled' })
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending');
      break;
    }

    // Envia via Evolution API
    try {
      const response = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: log.phone_e164,
            text: log.rendered_message,
          }),
        }
      );

      if (response.ok) {
        sentCount++;
        await supabase
          .from('campaign_logs')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', campaign_id)
          .eq('contact_id', log.contact_id);

        await supabase
          .from('campaigns')
          .update({ sent_count: sentCount })
          .eq('id', campaign_id);
      } else {
        failedCount++;
        const errorText = await response.text();
        await supabase
          .from('campaign_logs')
          .update({ status: 'failed', last_error: errorText })
          .eq('campaign_id', campaign_id)
          .eq('contact_id', log.contact_id);

        await supabase
          .from('campaigns')
          .update({ failed_count: failedCount })
          .eq('id', campaign_id);
      }
    } catch (err) {
      failedCount++;
      await supabase
        .from('campaign_logs')
        .update({
          status: 'failed',
          last_error: err instanceof Error ? err.message : 'Erro desconhecido',
        })
        .eq('campaign_id', campaign_id)
        .eq('contact_id', log.contact_id);

      await supabase
        .from('campaigns')
        .update({ failed_count: failedCount })
        .eq('id', campaign_id);
    }
  }

  // Marca campanha como completa
  await supabase
    .from('campaigns')
    .update({ status: 'completed' })
    .eq('id', campaign_id);

  return NextResponse.json({
    success: true,
    sent: sentCount,
    failed: failedCount,
    total: contacts.length,
  });
}
