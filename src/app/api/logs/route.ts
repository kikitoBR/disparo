import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/logs?campaign_id=xxx — Busca logs de uma campanha
export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaign_id');

  if (!campaignId) {
    // Retorna os últimos logs gerais (respostas recentes)
    const { data, error } = await supabase
      .from('campaign_logs')
      .select('*')
      .in('status', ['responded'])
      .order('response_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('campaign_logs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
