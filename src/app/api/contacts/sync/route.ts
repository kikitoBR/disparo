import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

interface EvolutionContact {
  id: string;
  pushName?: string;
  number?: string;
  profilePictureUrl?: string | null;
}

/**
 * Extrai o número de telefone limpo do JID do WhatsApp.
 * O formato do JID é: "5511999999999@s.whatsapp.net"
 * Retorna apenas a parte numérica antes do @
 */
function extractPhoneFromJid(jid: string): string {
  if (!jid) return '';
  // Remove tudo após o @ (inclusive o @)
  const numberPart = jid.split('@')[0];
  // Remove qualquer caractere não-numérico
  return numberPart.replace(/\D/g, '');
}

/**
 * Verifica se o JID é de um contato individual (não grupo, broadcast, etc.)
 */
function isPersonalContact(jid: string): boolean {
  if (!jid) return false;
  const lower = jid.toLowerCase();

  // Apenas aceitar JIDs que terminam com @s.whatsapp.net (contatos pessoais)
  if (!lower.endsWith('@s.whatsapp.net')) return false;

  // Excluir JIDs especiais
  if (
    lower.includes('status@') ||
    lower.startsWith('0@') ||
    lower.includes('newsletter') ||
    lower.includes('broadcast')
  ) {
    return false;
  }

  // Extrair a parte numérica e validar
  const numberPart = lower.split('@')[0];

  // Se contém hífen, é formato de grupo antigo
  if (numberPart.includes('-')) return false;

  // O número deve ter pelo menos 8 dígitos
  const digits = numberPart.replace(/\D/g, '');
  if (digits.length < 8) return false;

  return true;
}

/**
 * Busca contatos via POST /chat/findContacts/{instanceName}
 * Usa paginação com take/skip conforme a documentação oficial
 */
async function fetchContactsFromEvolution(
  baseUrl: string,
  instance: string,
  apiKey: string
): Promise<EvolutionContact[]> {
  const allContacts: EvolutionContact[] = [];
  const PAGE_SIZE = 500;
  let skip = 0;
  let hasMore = true;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  };

  while (hasMore) {
    try {
      // Documentação oficial: POST /chat/findContacts/{instanceName}
      // Body: { where: {}, take: number, skip: number }
      const url = `${baseUrl}/chat/findContacts/${instance}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          where: {},
          take: PAGE_SIZE,
          skip: skip,
        }),
      });

      if (!res.ok) {
        console.error(`Evolution API responded with ${res.status}: ${res.statusText}`);
        break;
      }

      const data = await res.json();

      // A resposta é um array de contatos
      const contacts: EvolutionContact[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.contacts)
          ? data.contacts
          : Array.isArray(data?.data)
            ? data.data
            : [];

      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      allContacts.push(...contacts);
      skip += contacts.length;

      // Se retornou menos que o PAGE_SIZE, não tem mais páginas
      if (contacts.length < PAGE_SIZE) {
        hasMore = false;
      }

      // Segurança: máximo de 5000 contatos
      if (allContacts.length >= 5000) {
        hasMore = false;
      }
    } catch (err) {
      console.error('Erro ao buscar contatos da Evolution API:', err);
      break;
    }
  }

  return allContacts;
}

// POST /api/contacts/sync — Sincroniza contatos do WhatsApp via Evolution API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const groupName = body.group || 'WhatsApp';

    // 1. Buscar todos os contatos da Evolution API
    const rawContacts = await fetchContactsFromEvolution(
      EVOLUTION_API_URL,
      EVOLUTION_INSTANCE,
      EVOLUTION_API_KEY
    );

    if (rawContacts.length === 0) {
      return NextResponse.json(
        {
          error:
            'Não foi possível obter contatos da Evolution API. Verifique se a instância está conectada e se a API Key está correta.',
          details: `URL: ${EVOLUTION_API_URL}, Instance: ${EVOLUTION_INSTANCE}`,
        },
        { status: 400 }
      );
    }

    // 2. Filtrar apenas contatos pessoais (não grupos) e processar telefones
    const toInsert: { phone_e164: string; name: string; group_name: string }[] = [];
    const seen = new Set<string>();
    let groupsFiltered = 0;
    let invalidPhones = 0;

    for (const contact of rawContacts) {
      const jid = contact.id || '';

      // Filtrar: apenas contatos pessoais
      if (!isPersonalContact(jid)) {
        groupsFiltered++;
        continue;
      }

      // Extrair número corretamente do JID
      const rawNumber = extractPhoneFromJid(jid);
      const phone = normalizePhone(rawNumber);

      if (!phone) {
        invalidPhones++;
        continue;
      }

      if (seen.has(phone)) continue;
      seen.add(phone);

      // O pushName é o nome do perfil WhatsApp do contato (definido por ele mesmo)
      const name = (contact.pushName || '').trim();

      toInsert.push({
        phone_e164: phone,
        name,
        group_name: groupName,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: `Nenhum contato pessoal válido encontrado. Total da API: ${rawContacts.length}, Grupos filtrados: ${groupsFiltered}, Telefones inválidos: ${invalidPhones}`,
      });
    }

    // 3. Inserir/Atualizar no Supabase (upsert por phone_e164)
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const contact of toInsert) {
      // Só atualizar o nome se vier preenchido da API (não sobrescrever um nome manual com vazio)
      const upsertData: Record<string, string> = {
        phone_e164: contact.phone_e164,
        group_name: contact.group_name,
        updated_at: new Date().toISOString(),
      };

      // Se tem nome vindo da API, inclui no upsert
      if (contact.name) {
        upsertData.name = contact.name;
      }

      const { data, error } = await supabase
        .from('contacts')
        .upsert(upsertData, { onConflict: 'phone_e164' })
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
      totalFromApi: rawContacts.length,
      groupsFiltered,
      invalidPhones,
      totalSynced: toInsert.length,
      inserted,
      updated,
      errors,
      message: `✅ Sincronização concluída! ${toInsert.length} contatos pessoais importados (${inserted} novos, ${updated} atualizados). ${groupsFiltered} grupos filtrados. Nota: a Evolution API retorna apenas contatos com quem você já interagiu no WhatsApp. Para importar todos os seus 407 contatos, use "Importar CSV/vCard".`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro na sincronização' },
      { status: 500 }
    );
  }
}
