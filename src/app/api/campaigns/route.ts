import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/campaigns — Lista campanhas
export async function GET() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/campaigns — Cria nova campanha
export async function POST(request: NextRequest) {
  const body = await request.json();

  const { title, message_template, group_filter, delay_min, delay_max, media_url, media_type } = body;

  if (!title || (!message_template && !media_url)) {
    return NextResponse.json({ error: 'Título e mensagem ou foto são obrigatórios.' }, { status: 400 });
  }

  // Conta os contatos que serão alvo
  let query = supabase.from('contacts').select('id', { count: 'exact' }).eq('status', 'active');
  if (group_filter && group_filter !== 'Todos') {
    query = query.eq('group_name', group_filter);
  }
  const { count } = await query;

  const campaignPayload: Record<string, unknown> = {
    title,
    message_template: message_template || '',
    group_filter: group_filter || null,
    delay_min: delay_min || 15,
    delay_max: delay_max || 40,
    total_targets: count || 0,
  };

  if (media_url) {
    campaignPayload.media_url = media_url;
    campaignPayload.media_type = media_type || 'image';
  }

  // Tentativa de inserção direta com media_url
  let { data, error } = await supabase
    .from('campaigns')
    .insert(campaignPayload)
    .select()
    .single();

  // Fallback caso as colunas media_url ainda não existam no Supabase
  if (error && error.message?.includes('media_url')) {
    delete campaignPayload.media_url;
    delete campaignPayload.media_type;
    const retry = await supabase
      .from('campaigns')
      .insert(campaignPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

