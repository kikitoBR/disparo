import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone, renderTemplate } from '@/lib/utils';

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
  if (media.startsWith('data:')) {
    const parts = media.split(',');
    if (parts.length > 1) {
      return parts[1];
    }
  }
  return media;
}

// POST /api/contacts/send-direct — Envia mensagem avulsa direta com suporte a texto e foto
export async function POST(request: NextRequest) {
  try {
    const { phone, message, contact_id, contact_name, media_url } = await request.json();

    if (!phone || (!message && !media_url)) {
      return NextResponse.json(
        { error: 'Telefone e mensagem ou foto são obrigatórios.' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Número de telefone inválido.' },
        { status: 400 }
      );
    }

    // Identifica o contato no Supabase se não foi passado o ID
    let targetContactId = contact_id || null;
    let name = contact_name || '';

    if (!targetContactId || !name) {
      const { data: foundContact } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('phone_e164', normalizedPhone)
        .maybeSingle();

      if (foundContact) {
        if (!targetContactId) targetContactId = foundContact.id;
        if (!name) name = foundContact.name;
      }
    }

    const fullName = (name || '').trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : '';

    const variables: Record<string, string> = {
      nome: fullName,
      primeiro_nome: firstName,
      primeironome: firstName,
      telefone: normalizedPhone,
    };

    const renderedMessage = renderTemplate(message || '', variables);

    // Chamada para a Evolution API
    let evolutionRes: Response;

    if (media_url) {
      const mimeType = getMimeType(media_url);
      const isUrl = media_url.startsWith('http://') || media_url.startsWith('https://');
      const mediaPayload = isUrl ? media_url : cleanBase64(media_url);

      evolutionRes = await fetch(
        `${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: normalizedPhone,
            mediatype: 'image',
            mimetype: mimeType,
            caption: renderedMessage,
            media: mediaPayload,
            fileName: 'imagem.jpg',
          }),
        }
      );
    } else {
      evolutionRes = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: normalizedPhone,
            text: renderedMessage,
          }),
        }
      );
    }

    if (!evolutionRes.ok) {
      const errData = await evolutionRes.json().catch(() => ({}));
      const errMessage =
        errData?.response?.message ||
        errData?.message ||
        `Erro ao enviar via Evolution API (status ${evolutionRes.status})`;

      // Registrar o erro no log
      const logErrorEntry: Record<string, unknown> = {
        contact_id: targetContactId,
        phone_e164: normalizedPhone,
        rendered_message: renderedMessage,
        status: 'failed',
        last_error: typeof errMessage === 'object' ? JSON.stringify(errMessage) : String(errMessage),
        sent_at: new Date().toISOString(),
      };
      await supabase.from('campaign_logs').insert(logErrorEntry);

      return NextResponse.json(
        { error: typeof errMessage === 'object' ? JSON.stringify(errMessage) : errMessage },
        { status: 400 }
      );
    }

    // Registrar o envio com sucesso nos logs
    const logPayload: Record<string, unknown> = {
      contact_id: targetContactId,
      phone_e164: normalizedPhone,
      rendered_message: renderedMessage,
      status: 'sent',
      sent_at: new Date().toISOString(),
    };

    if (media_url) {
      logPayload.media_url = media_url;
    }

    const { error: logInsertError } = await supabase.from('campaign_logs').insert(logPayload);
    if (logInsertError && logInsertError.message?.includes('media_url')) {
      delete logPayload.media_url;
      await supabase.from('campaign_logs').insert(logPayload);
    }

    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
      renderedMessage,
      message: 'Mensagem enviada com sucesso!',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao enviar mensagem.' },
      { status: 500 }
    );
  }
}
