import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/groups — Lista grupos de contatos
// Se ?details=true retorna [{ name, count }]
export async function GET(request: NextRequest) {
  const details = request.nextUrl.searchParams.get('details') === 'true';

  const { data, error } = await supabase
    .from('contacts')
    .select('group_name')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Contar contatos por grupo
  const countsMap: Record<string, number> = {};
  (data || []).forEach((c) => {
    const g = (c.group_name || 'Geral').trim();
    countsMap[g] = (countsMap[g] || 0) + 1;
  });

  const sortedGroupNames = Object.keys(countsMap).sort();

  if (details) {
    const list = sortedGroupNames.map((name) => ({
      name,
      count: countsMap[name],
    }));
    return NextResponse.json(list);
  }

  return NextResponse.json(sortedGroupNames);
}

// PUT /api/groups — Renomeia um grupo (old_name -> new_name)
export async function PUT(request: NextRequest) {
  try {
    const { old_name, new_name } = await request.json();

    if (!old_name || !new_name || !new_name.trim()) {
      return NextResponse.json(
        { error: 'old_name e new_name são obrigatórios.' },
        { status: 400 }
      );
    }

    const trimmedOld = old_name.trim();
    const trimmedNew = new_name.trim();

    if (trimmedOld === trimmedNew) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    // 1. Atualiza na tabela de contatos
    const { data: updatedContacts, error: contactsErr } = await supabase
      .from('contacts')
      .update({
        group_name: trimmedNew,
        updated_at: new Date().toISOString(),
      })
      .eq('group_name', trimmedOld)
      .select();

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    // 2. Opcional: Atualiza o filtro de grupo em campanhas existentes
    await supabase
      .from('campaigns')
      .update({ group_filter: trimmedNew })
      .eq('group_filter', trimmedOld);

    return NextResponse.json({
      success: true,
      updated: updatedContacts?.length || 0,
      old_name: trimmedOld,
      new_name: trimmedNew,
      message: `Grupo "${trimmedOld}" renomeado para "${trimmedNew}" com sucesso!`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao renomear grupo.' },
      { status: 500 }
    );
  }
}

// DELETE /api/groups — Apaga ou desassocia um grupo
// Body: { name: string, action: 'reassign' | 'delete_contacts' }
export async function DELETE(request: NextRequest) {
  try {
    const { name, action } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Nome do grupo é obrigatório.' }, { status: 400 });
    }

    const groupName = name.trim();
    const deleteAction = action || 'reassign'; // Padrão: mover para Geral

    if (deleteAction === 'delete_contacts') {
      // Excluir os contatos do grupo
      const { error } = await supabase.from('contacts').delete().eq('group_name', groupName);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        action: 'delete_contacts',
        message: `Grupo "${groupName}" e seus contatos foram excluídos.`,
      });
    } else {
      // Reatribuir contatos para 'Geral'
      const { data, error } = await supabase
        .from('contacts')
        .update({
          group_name: 'Geral',
          updated_at: new Date().toISOString(),
        })
        .eq('group_name', groupName)
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: 'reassign',
        reassigned: data?.length || 0,
        message: `Grupo "${groupName}" removido e seus ${data?.length || 0} contatos foram movidos para "Geral".`,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao remover grupo.' },
      { status: 500 }
    );
  }
}
