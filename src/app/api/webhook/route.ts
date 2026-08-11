import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';

// POST /api/webhook — Recebe webhooks da Evolution API (MESSAGES_UPSERT)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // A Evolution API envia diferentes formatos dependendo do evento
    // Evento: MESSAGES_UPSERT
    const event = body.event;

    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const data = body.data;
    if (!data) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Ignora mensagens enviadas por mim
    const fromMe = data.key?.fromMe;
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'fromMe' });
    }

    // Extrai o número do remetente
    const remoteJid = data.key?.remoteJid || '';
    // Formato: 5521999998888@s.whatsapp.net
    const rawPhone = remoteJid.split('@')[0];
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'invalid phone' });
    }

    // Extrai texto da mensagem
    const messageText =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      '[mídia]';

    // Salva na tabela de inbound_messages
    await supabase.from('inbound_messages').insert({
      phone_e164: phone,
      message_text: messageText,
    });

    // Verifica se há logs de campanha pendentes/enviados para esse número
    // e marca como "responded"
    const { data: logs } = await supabase
      .from('campaign_logs')
      .select('id, campaign_id')
      .eq('phone_e164', phone)
      .in('status', ['sent', 'pending'])
      .order('sent_at', { ascending: false })
      .limit(5);

    if (logs && logs.length > 0) {
      // Marca todos como respondidos
      const logIds = logs.map((l) => l.id);
      await supabase
        .from('campaign_logs')
        .update({
          status: 'responded',
          response_at: new Date().toISOString(),
          response_text: messageText,
        })
        .in('id', logIds);

      // Cancela pendentes restantes para esse contato nas mesmas campanhas
      const campaignIds = [...new Set(logs.map((l) => l.campaign_id))];
      for (const cid of campaignIds) {
        // Incrementa responded_count
        await supabase.rpc('increment_responded', { cid });

        // Cancela pendentes desse contato nessa campanha
        await supabase
          .from('campaign_logs')
          .update({ status: 'cancelled' })
          .eq('campaign_id', cid)
          .eq('phone_e164', phone)
          .eq('status', 'pending');
      }
    }

    return NextResponse.json({ ok: true, phone, messageText });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

// GET /api/webhook — Health check
export async function GET() {
  return NextResponse.json({ status: 'Webhook ativo e aguardando eventos da Evolution API.' });
}
