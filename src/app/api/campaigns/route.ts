import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { encodeMediaTemplate, extractMediaTemplate } from '@/lib/utils';

// GET /api/campaigns — Lista campanhas
export async function GET() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Extrai mídia e template limpo para o painel
  const campaigns = (data || []).map((c) => {
    const { message, mediaUrl } = extractMediaTemplate(c.message_template || '');
    return {
      ...c,
      message_template: message,
      media_url: c.media_url || mediaUrl,
    };
  });

  return NextResponse.json(campaigns);
}

// POST /api/campaigns — Cria nova campanha (com ou sem foto)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, message_template, group_filter, delay_min, delay_max, media_url } = body;

    if (!title || (!message_template && !media_url)) {
      return NextResponse.json({ error: 'Título e mensagem ou foto são obrigatórios.' }, { status: 400 });
    }

    // Conta os contatos que serão alvo
    let query = supabase.from('contacts').select('id', { count: 'exact' }).eq('status', 'active');
    if (group_filter && group_filter !== 'Todos') {
      query = query.eq('group_name', group_filter);
    }
    const { count } = await query;

    // Codifica mídia no template para compatibilidade universal com qualquer schema do Supabase
    const encodedTemplate = encodeMediaTemplate(message_template || '', media_url);

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        title,
        message_template: encodedTemplate,
        group_filter: group_filter || null,
        delay_min: delay_min || 15,
        delay_max: delay_max || 40,
        total_targets: count || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { message, mediaUrl: parsedMedia } = extractMediaTemplate(data.message_template || '');

    return NextResponse.json({
      ...data,
      message_template: message,
      media_url: data.media_url || parsedMedia,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao criar campanha.' },
      { status: 500 }
    );
  }
}
