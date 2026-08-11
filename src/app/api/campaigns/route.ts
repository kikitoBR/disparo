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

  const { title, message_template, group_filter, delay_min, delay_max } = body;

  if (!title || !message_template) {
    return NextResponse.json({ error: 'Título e mensagem são obrigatórios.' }, { status: 400 });
  }

  // Conta os contatos que serão alvo
  let query = supabase.from('contacts').select('id', { count: 'exact' }).eq('status', 'active');
  if (group_filter && group_filter !== 'Todos') {
    query = query.eq('group_name', group_filter);
  }
  const { count } = await query;

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      title,
      message_template,
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

  return NextResponse.json(data);
}
