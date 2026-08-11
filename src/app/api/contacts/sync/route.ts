import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

interface EvolutionContact {
  id?: string;
  remoteJid?: string;
  jid?: string;
  name?: string;
  pushName?: string;
  verifiedName?: string;
  shortName?: string;
  number?: string;
}

// POST /api/contacts/sync — Sincroniza a agenda de contatos diretamente do WhatsApp via Evolution API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const groupName = body.group || 'WhatsApp';

    let contactsFromEvo: EvolutionContact[] = [];

    // Tenta primeiro endpoint /chat/findContacts/instance
    try {
      const res1 = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({}),
      });

      if (res1.ok) {
        const data1 = await res1.json();
        if (Array.isArray(data1)) {
          contactsFromEvo = data1;
        } else if (data1 && Array.isArray(data1.contacts)) {
          contactsFromEvo = data1.contacts;
        }
      }
    } catch {
      /* fallback se o primeiro endpoint falhar */
    }

    // Se não encontrou contatos no primeiro endpoint, tenta /contact/find/instance
    if (contactsFromEvo.length === 0) {
      try {
        const res2 = await fetch(`${EVOLUTION_API_URL}/contact/find/${EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({}),
        });

        if (res2.ok) {
          const data2 = await res2.json();
          if (Array.isArray(data2)) {
            contactsFromEvo = data2;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (contactsFromEvo.length === 0) {
      return NextResponse.json(
        {
          error:
            'Não foi possível obter os contatos da Evolution API. Verifique se a instância do WhatsApp está conectada.',
        },
        { status: 400 }
      );
    }

    // Filtra e normaliza contatos
    const toInsert: { phone_e164: string; name: string; group_name: string }[] = [];
    const seen = new Set<string>();

    for (const item of contactsFromEvo) {
      const jid = item.id || item.remoteJid || item.jid || '';

      // Ignora grupos, transmissões e números do sistema
      if (
        !jid ||
        jid.includes('@g.us') ||
        jid.includes('@broadcast') ||
        jid.includes('status@') ||
        jid.includes('0@s.whatsapp.net')
      ) {
        continue;
      }

      const rawNumber = item.number || jid.split('@')[0];
      const phone = normalizePhone(rawNumber);

      if (phone && !seen.has(phone)) {
        seen.add(phone);
        const name = item.name || item.pushName || item.verifiedName || item.shortName || '';
        toInsert.push({
          phone_e164: phone,
          name: name.trim(),
          group_name: groupName,
        });
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ message: 'Nenhum contato pessoal válido encontrado.' });
    }

    // Insere / Atualiza no Supabase (desduplicação automática via phone_e164)
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const contact of toInsert) {
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
      } else if (data && data[0]) {
        const record = data[0];
        const created = new Date(record.created_at).getTime();
        const updated_at = new Date(record.updated_at).getTime();
        if (Math.abs(updated_at - created) < 2000) {
          inserted++;
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalSynced: toInsert.length,
      inserted,
      updated,
      errors,
      message: `🎉 Sincronização concluída! ${toInsert.length} contatos lidos do WhatsApp (${inserted} novos, ${updated} atualizados).`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro na sincronização' },
      { status: 500 }
    );
  }
}
