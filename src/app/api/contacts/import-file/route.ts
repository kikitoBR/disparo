import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';

/**
 * Parseia um arquivo CSV exportado do Google Contacts ou similar.
 * Suporta os formatos mais comuns:
 * - Google Contacts CSV: Name, Given Name, ..., Phone 1 - Value, ...
 * - CSV genérico: nome,telefone ou telefone,nome
 */
function parseCSV(content: string): { name: string; phone: string }[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detectar separador (vírgula ou ponto-e-vírgula)
  const firstLine = lines[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  // Parsear header
  const headers = parseCSVLine(firstLine, separator).map((h) => h.toLowerCase().trim());

  // Encontrar colunas relevantes
  const nameIdx = headers.findIndex(
    (h) =>
      h === 'name' ||
      h === 'nome' ||
      h === 'display name' ||
      h === 'full name' ||
      h === 'first name' ||
      h === 'given name'
  );

  const lastNameIdx = headers.findIndex(
    (h) =>
      h === 'family name' ||
      h === 'last name' ||
      h === 'sobrenome' ||
      h === 'additional name'
  );

  // Buscar TODAS as colunas de telefone (Google Contacts tem Phone 1, Phone 2, etc.)
  const phoneIdxs = headers.reduce<number[]>((acc, h, i) => {
    if (
      h.includes('phone') ||
      h.includes('telefone') ||
      h.includes('celular') ||
      h.includes('mobile') ||
      h.includes('número') ||
      h.includes('numero') ||
      h === 'tel'
    ) {
      acc.push(i);
    }
    return acc;
  }, []);

  // Se não encontrou colunas de telefone, tenta formato simples (col0=nome, col1=telefone)
  if (phoneIdxs.length === 0 && headers.length >= 2) {
    phoneIdxs.push(1);
  }

  const contacts: { name: string; phone: string }[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], separator);
    if (cols.length < 2) continue;

    // Montar nome
    let name = '';
    if (nameIdx >= 0) {
      name = (cols[nameIdx] || '').trim();
      if (lastNameIdx >= 0 && cols[lastNameIdx]) {
        const lastName = cols[lastNameIdx].trim();
        if (lastName && !name.includes(lastName)) {
          name = `${name} ${lastName}`.trim();
        }
      }
    }

    // Tentar todas as colunas de telefone
    for (const pIdx of phoneIdxs) {
      const rawPhone = (cols[pIdx] || '').trim();
      if (!rawPhone) continue;

      const phone = normalizePhone(rawPhone);
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        contacts.push({ name, phone });
        break; // Só pega o primeiro telefone válido por contato
      }
    }
  }

  return contacts;
}

/**
 * Parseia uma linha CSV respeitando aspas (para campos que contêm o separador)
 */
function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parseia um arquivo vCard (.vcf)
 * Formato:
 * BEGIN:VCARD
 * FN:Nome Completo
 * TEL;TYPE=CELL:+5521999998888
 * END:VCARD
 */
function parseVCard(content: string): { name: string; phone: string }[] {
  const contacts: { name: string; phone: string }[] = [];
  const seen = new Set<string>();

  // Dividir em blocos de vCard
  const cards = content.split(/BEGIN:VCARD/i).filter((c) => c.trim());

  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let name = '';
    let phone = '';

    for (const line of lines) {
      // Nome (FN = Full Name)
      if (line.toUpperCase().startsWith('FN:') || line.toUpperCase().startsWith('FN;')) {
        name = line.split(':').slice(1).join(':').trim();
      }

      // Telefone (TEL)
      if (line.toUpperCase().startsWith('TEL') && !phone) {
        const rawPhone = line.split(':').slice(1).join(':').trim();
        const normalized = normalizePhone(rawPhone);
        if (normalized) {
          phone = normalized;
        }
      }
    }

    if (phone && !seen.has(phone)) {
      seen.add(phone);
      contacts.push({ name, phone });
    }
  }

  return contacts;
}

// POST /api/contacts/import-file — Importa contatos de arquivo CSV ou vCard
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const groupName = (formData.get('group') as string) || 'Importado';

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const content = await file.text();
    const fileName = file.name.toLowerCase();

    let parsed: { name: string; phone: string }[] = [];

    if (fileName.endsWith('.vcf') || fileName.endsWith('.vcard')) {
      parsed = parseVCard(content);
    } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      parsed = parseCSV(content);
    } else {
      // Tentar detectar automaticamente
      if (content.includes('BEGIN:VCARD')) {
        parsed = parseVCard(content);
      } else {
        parsed = parseCSV(content);
      }
    }

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhum contato válido encontrado no arquivo. Verifique se o formato é CSV (com colunas nome e telefone) ou vCard (.vcf).',
        },
        { status: 400 }
      );
    }

    // Inserir no Supabase
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const contact of parsed) {
      const upsertData: Record<string, string> = {
        phone_e164: contact.phone,
        group_name: groupName,
        updated_at: new Date().toISOString(),
      };

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
      fileName: file.name,
      totalParsed: parsed.length,
      inserted,
      updated,
      errors,
      message: `✅ Arquivo "${file.name}" importado! ${parsed.length} contatos processados (${inserted} novos, ${updated} atualizados${errors > 0 ? `, ${errors} erros` : ''}).`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' },
      { status: 500 }
    );
  }
}
