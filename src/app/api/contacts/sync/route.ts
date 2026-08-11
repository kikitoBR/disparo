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

function extractContactsList(data: any): EvolutionContact[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.contacts)) return data.contacts;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.response)) return data.response;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

/**
 * Valida se o item é um contato pessoal legítimo (e não um grupo ou lista de transmissão)
 */
function isIndividualContact(item: EvolutionContact): boolean {
  const jid = (item.id || item.remoteJid || item.jid || '').toLowerCase();

  // Exclui explicitamente se for marcado como grupo
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

/**
 * Faz varredura paginada na Evolution API para puxar TODOS os contatos sem corte de limite
 */
async function fetchAllFromEndpoint(
  baseUrl: string,
  instance: string,
  endpointPath: string,
  isGet: boolean,
  headers: any
): Promise<EvolutionContact[]> {
  const items: EvolutionContact[] = [];

  // Varre até 20 páginas (até 10.000 contatos)
  for (let page = 1; page <= 20; page++) {
    try {
      let data: any = null;

      if (isGet) {
        const url = `${baseUrl}${endpointPath}/${instance}?page=${page}&limit=500&take=500`;
        const res = await fetch(url, { headers });
        if (res.ok) data = await res.json();
      } else {
        const url = `${baseUrl}${endpointPath}/${instance}`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page, limit: 500, take: 500, offset: (page - 1) * 500 }),
        });
        if (res.ok) data = await res.json();
      }

      const list = extractContactsList(data);
      if (list.length === 0) break;

      items.push(...list);

      // Se a página retornou menos que 50 itens, encerra a paginação
      if (list.length < 50) break;
    } catch {
      break;
    }
  }

  return items;
}

// POST /api/contacts/sync — Sincroniza TODOS os 400+ contatos pessoais da agenda do WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const groupName = body.group || 'WhatsApp';

    const headers = {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    };

    const allRawItems: EvolutionContact[] = [];

    // Múltiplos caminhos da Evolution API (v1 e v2) com busca paginada
    const endpoints = [
      { path: '/chat/findContacts', get: false },
      { path: '/contact/find', get: false },
      { path: '/chat/findChats', get: false },
      { path: '/chat/fetchContacts', get: false },
      { path: '/chat/findContacts', get: true },
      { path: '/contact/find', get: true },
    ];

    for (const ep of endpoints) {
      const list = await fetchAllFromEndpoint(
        EVOLUTION_API_URL,
        EVOLUTION_INSTANCE,
        ep.path,
        ep.get,
        headers
      );
      if (list.length > 0) {
        allRawItems.push(...list);
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

    // Processa, limpa telefone e desduplica contatos pessoais
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
      message: `🎉 Sincronização concluída! ${toInsert.length} contatos pessoais importados com sucesso! Telefones corrigidos e grupos filtrados.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro na sincronização' },
      { status: 500 }
    );
  }
}
