import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone, parseContactLines } from '@/lib/utils';

// GET /api/contacts — Lista contatos com filtro opcional por grupo
export async function GET(request: NextRequest) {
  const group = request.nextUrl.searchParams.get('group');
  const search = request.nextUrl.searchParams.get('search');

  let query = supabase
    .from('contacts')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (group && group !== 'Todos') {
    query = query.eq('group_name', group);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone_e164.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/contacts — Importa contatos (com desduplicação)
// Body: { contacts: [{ phone, name?, group? }] } OU { text: "lista de contatos (Nome, Telefone ou Telefone)", group?: "Grupo" }
export async function POST(request: NextRequest) {
  const body = await request.json();

  let contactsToInsert: { phone_e164: string; name: string; group_name: string }[] = [];

  if (body.text) {
    // Modo texto: suporta "Nome, Telefone" ou apenas "Telefone"
    const parsed = parseContactLines(body.text);
    contactsToInsert = parsed.map((item) => ({
      phone_e164: item.phone,
      name: item.name || body.name || '',
      group_name: body.group || 'Geral',
    }));
  } else if (body.contacts && Array.isArray(body.contacts)) {
    // Modo estruturado
    for (const c of body.contacts) {
      const phone = normalizePhone(c.phone || c.telefone || c.numero || '');
      if (phone) {
        contactsToInsert.push({
          phone_e164: phone,
          name: c.name || c.nome || '',
          group_name: c.group || c.grupo || 'Geral',
        });
      }
    }
  }

  if (contactsToInsert.length === 0) {
    return NextResponse.json({ error: 'Nenhum número válido encontrado.' }, { status: 400 });
  }

  // Upsert: insere novos, atualiza nome/grupo se já existir
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const contact of contactsToInsert) {
    const { data, error } = await supabase
      .from('contacts')
      .upsert(
        {
          phone_e164: contact.phone_e164,
          name: contact.name,
          group_name: contact.group_name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone_e164' }
      )
      .select();

    if (error) {
      errors++;
    } else if (data) {
      const record = data[0];
      if (record) {
        const created = new Date(record.created_at).getTime();
        const updated_at = new Date(record.updated_at).getTime();
        if (Math.abs(updated_at - created) < 2000) {
          inserted++;
        } else {
          updated++;
        }
      }
    }
  }

  return NextResponse.json({
    total: contactsToInsert.length,
    inserted,
    updated,
    errors,
    message: `${inserted} novos, ${updated} atualizados, ${errors} erros.`,
  });
}

// PUT /api/contacts — Atualiza contato existente por ID
export async function PUT(request: NextRequest) {
  const { id, name, group_name } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'ID do contato é obrigatório.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('contacts')
    .update({
      name: name ?? '',
      group_name: group_name ?? 'Geral',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data?.[0]);
}

// DELETE /api/contacts — Remove contato por ID
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();

  const { error } = await supabase.from('contacts').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
