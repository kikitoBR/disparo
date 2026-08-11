export function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  // Remove tudo que não for dígito
  let num = raw.replace(/\D/g, '');

  // Se o número começa com 550 (ex: 55 + 021 + numero), remove o 0 extra após o 55
  if (num.startsWith('550')) {
    num = '55' + num.slice(3);
  }

  // Remove zeros à esquerda (ex: 02199998888 -> 21999998888, 0021... -> 21...)
  num = num.replace(/^0+/, '');

  if (num.length < 10) return null;

  // Se já começa com 55 e tem 12 ou 13 dígitos
  if (num.startsWith('55') && (num.length === 12 || num.length === 13)) {
    return num;
  }

  // Se tem 10 ou 11 dígitos (DDD + número)
  if (num.length === 10 || num.length === 11) {
    return '55' + num;
  }

  // Se tem mais de 13 dígitos e começa com 55 (corta no limite E.164)
  if (num.startsWith('55') && num.length > 13) {
    return num.slice(0, 13);
  }

  return null;
}

export interface ParsedContactInput {
  phone: string;
  name: string;
}

/**
 * Processa linhas de texto suportando formatos como:
 * - "João Silva, 21999998888"
 * - "21999998888, Maria"
 * - "5521999998888 - Carlos"
 * - "21999998888" (sem nome)
 */
export function parseContactLines(text: string): ParsedContactInput[] {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const result: ParsedContactInput[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Tenta separar por vírgula, ponto-e-vírgula, hífen ou tabulação
    const parts = trimmed.split(/[,;\t]+/);

    let phone: string | null = null;
    let name = '';

    if (parts.length >= 2) {
      const phoneCandidate1 = normalizePhone(parts[0].trim());
      const phoneCandidate2 = normalizePhone(parts[1].trim());

      if (phoneCandidate1) {
        phone = phoneCandidate1;
        name = parts.slice(1).join(' ').trim();
      } else if (phoneCandidate2) {
        phone = phoneCandidate2;
        name = parts[0].trim();
      } else {
        phone = normalizePhone(trimmed);
      }
    } else {
      // Linha sem separador: verifica se tem nome após espaço ou hífen
      const hyphenParts = trimmed.split('-');
      if (hyphenParts.length >= 2) {
        const p1 = normalizePhone(hyphenParts[0].trim());
        const p2 = normalizePhone(hyphenParts[1].trim());
        if (p1) {
          phone = p1;
          name = hyphenParts.slice(1).join(' ').trim();
        } else if (p2) {
          phone = p2;
          name = hyphenParts[0].trim();
        }
      }

      if (!phone) {
        phone = normalizePhone(trimmed);
      }
    }

    if (phone && !seen.has(phone)) {
      seen.add(phone);
      result.push({ phone, name });
    }
  }

  return result;
}

/**
 * Processa uma lista de números (um por linha) e retorna apenas os válidos e únicos.
 */
export function parsePhoneList(text: string): string[] {
  return parseContactLines(text).map((c) => c.phone);
}

/**
 * Renderiza um template de mensagem substituindo variáveis como {{nome}}, {{empresa}}, etc.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] || '';
  });
}
