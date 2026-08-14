import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { renderTemplate, extractMediaTemplate, encodeMediaTemplate } from '@/lib/utils';

// POST /api/dispatch — Inicializa, pausa, retoma ou cancela o disparo de uma campanha
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaign_id, action = 'init' } = body;

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

    // Ações de controle: Pause, Resume, Cancel
    if (action === 'pause') {
      await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', campaign_id);
      return NextResponse.json({ success: true, status: 'paused' });
    }

    if (action === 'resume') {
      await supabase
        .from('campaigns')
        .update({ status: 'running' })
        .eq('id', campaign_id);
      return NextResponse.json({ success: true, status: 'running' });
    }

    if (action === 'cancel') {
      await supabase
        .from('campaigns')
        .update({ status: 'cancelled' })
        .eq('id', campaign_id);

      await supabase
        .from('campaign_logs')
        .update({ status: 'cancelled' })
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending');

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // Ação Padrão: Inicializar a campanha para disparo
    // 1. Verifica se já existem logs criados para esta campanha
    const { data: existingLogs } = await supabase
      .from('campaign_logs')
      .select('id, status')
      .eq('campaign_id', campaign_id);

    if (existingLogs && existingLogs.length > 0) {
      const pendingCount = existingLogs.filter((l) => l.status === 'pending').length;
      await supabase
        .from('campaigns')
        .update({ status: 'running' })
        .eq('id', campaign_id);

      return NextResponse.json({
        success: true,
        campaign_id,
        alreadyInitialized: true,
        total: existingLogs.length,
        pending: pendingCount,
        sent: campaign.sent_count || 0,
        failed: campaign.failed_count || 0,
      });
    }

    // 2. Se não existem logs, busca os contatos alvo
    let query = supabase.from('contacts').select('*').eq('status', 'active');
    if (campaign.group_filter && campaign.group_filter !== 'Todos') {
      query = query.eq('group_name', campaign.group_filter);
    }
    const { data: contacts, error: contactsError } = await query;

    if (contactsError || !contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum contato encontrado para o grupo selecionado.' },
        { status: 400 }
      );
    }

    // Extrai mensagem e mídia
    const { message: cleanTemplate, mediaUrl } = extractMediaTemplate(campaign.message_template || '');
    const finalMedia = campaign.media_url || mediaUrl;

    // 3. Marca a campanha como running e total_targets
    await supabase
      .from('campaigns')
      .update({ status: 'running', total_targets: contacts.length })
      .eq('id', campaign_id);

    // 4. Cria os logs pendentes para cada contato
    const logs = contacts.map((contact) => {
      const fullName = (contact.name || '').trim();
      const firstName = fullName ? fullName.split(/\s+/)[0] : '';

      const variables: Record<string, string> = {
        nome: fullName,
        primeiro_nome: firstName,
        primeironome: firstName,
        telefone: contact.phone_e164,
        grupo: contact.group_name || '',
        ...(contact.custom_fields || {}),
      };

      const rendered = renderTemplate(cleanTemplate, variables);
      const encodedRendered = encodeMediaTemplate(rendered, finalMedia);

      return {
        campaign_id,
        contact_id: contact.id,
        phone_e164: contact.phone_e164,
        rendered_message: encodedRendered,
        status: 'pending',
      };
    });

    // Insere logs em batches de 100
    for (let i = 0; i < logs.length; i += 100) {
      const batch = logs.slice(i, i + 100);
      await supabase.from('campaign_logs').insert(batch);
    }

    return NextResponse.json({
      success: true,
      campaign_id,
      total: contacts.length,
      pending: contacts.length,
      sent: 0,
      failed: 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao inicializar disparo.' },
      { status: 500 }
    );
  }
}
