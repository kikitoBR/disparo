import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone, extractMediaTemplate } from '@/lib/utils';
import type { ContactMessageHistoryItem } from '@/lib/types';

// GET /api/contacts/history?contact_id=xxx&phone=yyy — Busca apenas os disparos realizados para o contato
export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contact_id');
    const rawPhone = request.nextUrl.searchParams.get('phone');

    let phone: string | null = rawPhone ? normalizePhone(rawPhone) : null;
    let contactInfo: Record<string, unknown> | null = null;

    // 1. Busca dados do contato
    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle();

      if (contact) {
        contactInfo = contact;
        if (!phone) phone = contact.phone_e164;
      }
    } else if (phone) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_e164', phone)
        .maybeSingle();

      if (contact) {
        contactInfo = contact;
      }
    }

    if (!contactId && !phone) {
      return NextResponse.json(
        { error: 'contact_id ou phone é obrigatório.' },
        { status: 400 }
      );
    }

    // 2. Busca APENAS os disparos realizados nos logs (campaign_logs)
    let logsQuery = supabase
      .from('campaign_logs')
      .select('id, campaign_id, contact_id, phone_e164, rendered_message, status, sent_at, response_at, response_text, last_error')
      .order('sent_at', { ascending: false });

    if (contactId && phone) {
      logsQuery = logsQuery.or(`contact_id.eq.${contactId},phone_e164.eq.${phone}`);
    } else if (contactId) {
      logsQuery = logsQuery.eq('contact_id', contactId);
    } else if (phone) {
      logsQuery = logsQuery.eq('phone_e164', phone);
    }

    const { data: sentLogs, error: logsError } = await logsQuery;
    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    // Busca títulos das campanhas relacionadas aos disparos
    const campaignIds = [
      ...new Set((sentLogs || []).map((l) => l.campaign_id).filter(Boolean)),
    ];
    let campaignsMap: Record<string, string> = {};
    if (campaignIds.length > 0) {
      const { data: camps } = await supabase
        .from('campaigns')
        .select('id, title')
        .in('id', campaignIds);
      if (camps) {
        camps.forEach((c) => {
          campaignsMap[c.id] = c.title;
        });
      }
    }

    // 3. Monta a lista filtrando exclusivamente os disparos realizados
    const history: ContactMessageHistoryItem[] = (sentLogs || []).map((log) => {
      const { message, mediaUrl } = extractMediaTemplate(log.rendered_message || '');
      return {
        id: log.id,
        type: 'sent',
        text: message,
        media_url: mediaUrl,
        status: log.status,
        timestamp: log.sent_at || log.response_at || new Date().toISOString(),
        campaign_title: log.campaign_id ? campaignsMap[log.campaign_id] || 'Campanha' : 'Envio Avulso',
        error: log.last_error,
      };
    });

    // Ordena do mais recente para o mais antigo
    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalSent = history.filter((l) => l.status === 'sent' || l.status === 'responded').length;
    const totalFailed = history.filter((l) => l.status === 'failed').length;

    return NextResponse.json({
      contact: contactInfo,
      phone,
      total_sent: totalSent,
      total_failed: totalFailed,
      history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar histórico de disparos.' },
      { status: 500 }
    );
  }
}
