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
  isGroup?: boolean;
  isUser?: boolean;
  isMyContact?: boolean;
  isSaved?: boolean;
}

/**
 * Valida se o item é um contato pessoal legítimo (e não um grupo ou lista de transmissão)
 */
function isIndividualContact(item: EvolutionContact): boolean {
  const jid = (item.id || item.remoteJid || item.jid || '').toLowerCase();

  // Exclui explicitamente se for marcado como grupo ou se não for usuário
  if (item.isGroup === true || (item as any).isGroup === 'true') return false;
  if (item.isUser === false || (item as any).isUser === 'false') return false;

  // Exclui JIDs de grupo (@g.us), transmissão (@broadcast) e status
  if (
    jid.includes('@g.us') ||
    jid.includes('@broadcast') ||
    jid.includes('status@') ||
    jid.includes('0@s.whatsapp.net') ||
    jid.includes('newsletter')
  ) {
    return false;
  }

  // Grupos antigos do WhatsApp usavam formato numero-timestamp@g.us
  if (jid.includes('-')) return false;

  // Se tiver um domínio @ que não seja @s.whatsapp.net, ignora
  if (jid.includes('@') && !jid.endsWith('@s.whatsapp.net')) return false;

  return true;
}

// POST /api/contacts/sync — Sincroniza TODOS os contatos pessoais do WhatsApp via Evolution API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const groupName = body.group || 'WhatsApp';

    const allRawItems: EvolutionContact[] = [];

    const headers = {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    };

    // Tenta obter contatos de múltiplos endpoints da Evolution API para garantir que pegamos a agenda inteira sem limite de 100
    const endpoints = [
      { url: `${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`, method: 'POST', body: { limit: 10000 } },
      { url: `${EVOLUTION_API_URL}/contact/find/${EVOLUTION_INSTANCE}`, method: 'POST', body: { where: {}, limit: 10000 } },
      { url: `${EVOLUTION_API_URL}/chat/fetchContacts/${EVOLUTION_INSTANCE}`, method: 'POST', body: {} },
      { url: `${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}?limit=10000`, method: 'GET' },
      { url: `${EVOLUTION_API_URL}/contact/find/${EVOLUTION_INSTANCE}?limit=10000`, method: 'GET' },
    ];

    for (const ep of endpoints) {
      try {
        const options: RequestInit = {
          method: ep.method,
          headers,
        };
        if (ep.method === 'POST' && ep.body) {
          options.body = JSON.stringify(ep.body);
        }

        const res = await fetch(ep.url, options);
        if (res.ok) {
          const data = await res.json();
          let list: EvolutionContact[] = [];
          if (Array.isArray(data)) {
            list = data;
          } else if (data && Array.isArray(data.contacts)) {
            list = data.contacts;
          } else if (data && Array.isArray(data.response)) {
            list = data.response;
          }

          if (list.length > 0) {
            allRawItems.push(...list);
          }
        }
      } catch {
        /* ignora falhas individuais de endpoint */
      }
    }

    if (allRawItems.length === 0) {
      return NextResponse.json(
        {
          error:
            'Não foi possível obter os contatos da Evolution API. Verifique se a instância do WhatsApp está conectada.',
        },
        { status: 400 }
      );
    }

    // Processa e desduplica contatos pessoais
    const toInsert: { phone_e164: string; name: string; group_name: string }[] = [];
    const seen = new Set<string>();

    for (const item of allRawItems) {
      if (!isIndividualContact(item)) continue;

      const jid = item.id || item.remoteJid || item.jid || '';
      const rawNumber = item.number || jid.split('@')[0] || '';
      const phone = normalizePhone(rawNumber);

      if (phone && !seen.has(phone)) {
        seen.add(phone);
        const name =
          item.name ||
          item.pushName ||
          item.verifiedName ||
          item.shortName ||
          '';

        toInsert.push({
          phone_e164: phone,
          name: name.trim(),
          group_name: groupName,
        });
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ message: 'Nenhum contato pessoal válido encontrado na agenda.' });
    }

    // Insere/Atualiza no Supabase
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
      message: `🎉 Sincronização concluída! ${toInsert.length} contatos pessoais importados do WhatsApp (${inserted} novos, ${updated} atualizados). Grupos foram totalmente ignorados.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro na sincronização' },
      { status: 500 }
    );
  }
}
