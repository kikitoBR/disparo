import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/groups — Lista todos os grupos de contatos distintos
export async function GET() {
  const { data, error } = await supabase
    .from('contacts')
    .select('group_name')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Extrair grupos únicos
  const groups = [...new Set((data || []).map((c) => c.group_name || 'Geral'))];
  groups.sort();

  return NextResponse.json(groups);
}
