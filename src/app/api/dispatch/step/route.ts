import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

function getMimeType(media: string): string {
  if (media.startsWith('data:image/png')) return 'image/png';
  if (media.startsWith('data:image/webp')) return 'image/webp';
  if (media.startsWith('data:image/gif')) return 'image/gif';
  if (media.endsWith('.png')) return 'image/png';
  if (media.endsWith('.webp')) return 'image/webp';
  if (media.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function cleanBase64(media: string): string {
  // If it's a data url, extract the raw base64 or pass clean string
  if (media.startsWith('data:')) {
    const parts = media.split(',');
    if (parts.length > 1) {
      return parts[1];
    }
  }
  return media;
}

// POST /api/dispatch/step — Envia 1 único contato pendente da campanha (anti-timeout)
export async function POST(request: NextRequest) {
  try {
    const { campaign_id } = await request.json();

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id é obrigatório.' }, { status: 400 });
    }

    // 1. Busca a campanha
    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    }

    // Se a campanha está pausada ou cancelada, não executa o passo
    if (campaign.status === 'paused' || campaign.status === 'cancelled') {
      return NextResponse.json({
        done: true,
        paused: campaign.status === 'paused',
        cancelled: campaign.status === 'cancelled',
        message: `Campanha está ${campaign.status}.`,
      });
    }

    // 2. Busca o próximo log pendente
    const { data: pendingLogs, error: logError } = await supabase
      .from('campaign_logs')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending')
      .order('id', { ascending: true })
      .limit(1);

    if (logError) {
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    // Se não há mais logs pendentes, finaliza a campanha
    if (!pendingLogs || pendingLogs.length === 0) {
      await supabase
        .from('campaigns')
        .update({ status: 'completed' })
        .eq('id', campaign_id);

      return NextResponse.json({
        done: true,
        campaign_id,
        sent_count: campaign.sent_count,
        failed_count: campaign.failed_count,
        total: campaign.total_targets,
        message: 'Todos os contatos foram processados!',
      });
    }

    const log = pendingLogs[0];

    // Busca o nome do contato se disponível
    let contactName = '';
    if (log.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', log.contact_id)
        .single();
      if (contact?.name) contactName = contact.name;
    }

    // Determina se há mídia para enviar
    const media = campaign.media_url || log.media_url || null;
    let isSuccess = false;
    let errorMessage: string | null = null;

    try {
      let response: Response;

      if (media) {
        // Envio de mídia com legenda
        const mimeType = getMimeType(media);
        const isUrl = media.startsWith('http://') || media.startsWith('https://');
        const mediaPayload = isUrl ? media : cleanBase64(media);

        response = await fetch(
          `${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              number: log.phone_e164,
              mediatype: 'image',
              mimetype: mimeType,
              caption: log.rendered_message || '',
              media: mediaPayload,
              fileName: 'imagem.jpg',
            }),
          }
        );
      } else {
        // Envio de texto padrão
        response = await fetch(
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
      }

      if (response.ok) {
        isSuccess = true;
      } else {
        const errJson = await response.json().catch(() => null);
        const errText = errJson?.response?.message || errJson?.message || (await response.text().catch(() => 'Erro desconhecido'));
        errorMessage = typeof errText === 'object' ? JSON.stringify(errText) : String(errText);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Falha na conexão com a Evolution API';
    }

    // Atualiza contadores e status do log
    const nowIso = new Date().toISOString();
    let newSentCount = campaign.sent_count || 0;
    let newFailedCount = campaign.failed_count || 0;

    if (isSuccess) {
      newSentCount += 1;
      await supabase
        .from('campaign_logs')
        .update({
          status: 'sent',
          sent_at: nowIso,
          last_error: null,
        })
        .eq('id', log.id);
    } else {
      newFailedCount += 1;
      await supabase
        .from('campaign_logs')
        .update({
          status: 'failed',
          last_error: errorMessage || 'Erro ao enviar',
        })
        .eq('id', log.id);
    }

    // Atualiza contadores na campanha
    await supabase
      .from('campaigns')
      .update({
        sent_count: newSentCount,
        failed_count: newFailedCount,
      })
      .eq('id', campaign_id);

    // Conta quantos restam
    const { count: remainingCount } = await supabase
      .from('campaign_logs')
      .select('id', { count: 'exact' })
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending');

    const remaining = remainingCount || 0;

    // Se não sobra nenhum pendente após esse envio, marca campanha como completed
    if (remaining === 0) {
      await supabase
        .from('campaigns')
        .update({ status: 'completed' })
        .eq('id', campaign_id);
    }

    return NextResponse.json({
      done: remaining === 0,
      log_id: log.id,
      phone_e164: log.phone_e164,
      contact_name: contactName,
      status: isSuccess ? 'sent' : 'failed',
      sent_at: nowIso,
      error: errorMessage,
      sent_count: newSentCount,
      failed_count: newFailedCount,
      remaining,
      total: campaign.total_targets,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar envio.' },
      { status: 500 }
    );
  }
}
