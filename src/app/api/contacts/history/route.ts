import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';
import type { ContactMessageHistoryItem } from '@/lib/types';

// GET /api/contacts/history?contact_id=xxx&phone=yyy — Busca histórico completo de mensagens do contato
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

    // 2. Busca mensagens enviadas dos logs (campaign_logs)
    let logsQuery = supabase
      .from('campaign_logs')
      .select('id, campaign_id, contact_id, phone_e164, rendered_message, status, sent_at, response_at, response_text, last_error');

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

    // Busca títulos das campanhas relacionadas
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

    // 3. Busca mensagens recebidas (inbound_messages)
    let inboundList: Array<{ id: string; phone_e164: string; message_text: string; received_at: string }> = [];
    if (phone) {
      const { data: inbounds } = await supabase
        .from('inbound_messages')
        .select('*')
        .eq('phone_e164', phone)
        .order('received_at', { ascending: false });

      if (inbounds) {
        inboundList = inbounds;
      }
    }

    // 4. Monta a lista unificada cronológica
    const history: ContactMessageHistoryItem[] = [];

    (sentLogs || []).forEach((log) => {
      history.push({
        id: log.id,
        type: 'sent',
        text: log.rendered_message,
        status: log.status,
        timestamp: log.sent_at || log.response_at || new Date().toISOString(),
        campaign_title: log.campaign_id ? campaignsMap[log.campaign_id] || 'Campanha' : 'Envio Avulso',
        error: log.last_error,
      });

      // Se o log tiver resposta registrada diretamente nele, adiciona se não estiver em inbound
      if (log.response_text && log.response_at) {
        const alreadyInbound = inboundList.some(
          (inb) => inb.message_text === log.response_text
        );
        if (!alreadyInbound) {
          history.push({
            id: `resp-${log.id}`,
            type: 'received',
            text: log.response_text,
            timestamp: log.response_at,
          });
        }
      }
    });

    inboundList.forEach((inb) => {
      history.push({
        id: inb.id,
        type: 'received',
        text: inb.message_text,
        timestamp: inb.received_at,
      });
    });

    // Ordena do mais recente para o mais antigo
    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalSent = (sentLogs || []).filter((l) => l.status === 'sent' || l.status === 'responded').length;
    const totalFailed = (sentLogs || []).filter((l) => l.status === 'failed').length;
    const totalResponses = history.filter((h) => h.type === 'received').length;

    return NextResponse.json({
      contact: contactInfo,
      phone,
      total_sent: totalSent,
      total_failed: totalFailed,
      total_responses: totalResponses,
      history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar histórico.' },
      { status: 500 }
    );
  }
}
