/**
 * Normaliza um número de telefone brasileiro para formato E.164 (55 + DDD + número).
 * Remove caracteres não numéricos e adiciona DDI 55 se necessário.
 */
export function normalizePhone(raw: string): string | null {
  // Remove tudo que não for dígito
  let num = raw.replace(/\D/g, '');

  // Se for muito curto, descarta
  if (num.length < 10) return null;

  // Se tem 10 ou 11 dígitos (sem DDI), adiciona 55
  if (num.length === 10 || num.length === 11) {
    num = '55' + num;
  }

  // Validação final: deve ter 12 ou 13 dígitos (55 + DDD 2dig + 8 ou 9 dig)
  if (num.length < 12 || num.length > 13) return null;

  return num;
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
