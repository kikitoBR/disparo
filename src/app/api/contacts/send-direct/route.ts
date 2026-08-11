import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone, renderTemplate } from '@/lib/utils';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

// POST /api/contacts/send-direct — Envia mensagem avulsa direta para um contato ou número
export async function POST(request: NextRequest) {
  try {
    const { phone, message, contact_id, contact_name } = await request.json();

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Telefone e mensagem são obrigatórios.' },
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

    // Se temos o contact_id ou contact_name, preenche as variáveis
    let name = contact_name || '';
    if (!name && contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', contact_id)
        .single();
      if (data?.name) name = data.name;
    }

    const fullName = (name || '').trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : '';

    const variables: Record<string, string> = {
      nome: fullName,
      primeiro_nome: firstName,
      primeironome: firstName,
      telefone: normalizedPhone,
    };

    const renderedMessage = renderTemplate(message, variables);

    // Chamada direta para a Evolution API
    const evolutionRes = await fetch(
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

    if (!evolutionRes.ok) {
      const errData = await evolutionRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            errData?.response?.message ||
            errData?.message ||
            `Erro ao enviar via Evolution API (status ${evolutionRes.status})`,
        },
        { status: 400 }
      );
    }

    // Registrar o envio avulso nos logs se tivermos contact_id
    if (contact_id) {
      await supabase.from('campaign_logs').insert({
        contact_id,
        phone_e164: normalizedPhone,
        rendered_message: renderedMessage,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
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
