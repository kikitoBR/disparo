'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Phone,
  Rocket,
} from 'lucide-react';
import type { Contact, ContactMessageHistoryItem } from '@/lib/types';

interface ContactHistoryModalProps {
  contact: Contact;
  onClose: () => void;
  onOpenDirectSend?: (contact: Contact) => void;
}

export function ContactHistoryModal({
  contact,
  onClose,
  onOpenDirectSend,
}: ContactHistoryModalProps) {
  const [history, setHistory] = useState<ContactMessageHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_sent: 0, total_failed: 0 });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/contacts/history?contact_id=${contact.id}&phone=${encodeURIComponent(
          contact.phone_e164
        )}`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.history)) {
        setHistory(data.history);
        setStats({
          total_sent: data.total_sent || 0,
          total_failed: data.total_failed || 0,
        });
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [contact.id, contact.phone_e164]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-surface/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                Disparos Realizados para {contact.name || contact.phone_e164}
                <span className="badge badge-sent text-[11px] py-0.5">{contact.group_name}</span>
              </h3>
              <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
                <Phone className="w-3 h-3" />
                <span className="font-mono">{contact.phone_e164}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHistory}
              title="Recarregar disparos"
              className="p-2 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="px-5 py-3 bg-surface/20 border-b border-border/40 grid grid-cols-2 gap-3 text-center text-xs">
          <div className="p-2.5 rounded-lg bg-surface/50 border border-border/40">
            <span className="text-muted block text-[11px]">Disparos Entregues</span>
            <span className="text-base font-bold text-accent">{stats.total_sent}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface/50 border border-border/40">
            <span className="text-muted block text-[11px]">Falhas de Envio</span>
            <span className={`text-base font-bold ${stats.total_failed > 0 ? 'text-danger' : 'text-muted'}`}>
              {stats.total_failed}
            </span>
          </div>
        </div>

        {/* Message Feed - Apenas Disparos Realizados */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-background/50">
          {loading && history.length === 0 ? (
            <div className="py-12 text-center text-muted text-sm flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-accent" />
              <span>Carregando disparos realizados...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-muted text-sm space-y-2">
              <Rocket className="w-10 h-10 mx-auto text-muted/50" />
              <p className="font-medium text-foreground">Nenhum disparo realizado para este contato ainda.</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Quando você incluir este contato em um disparo de campanha ou fizer um envio avulso, as mensagens enviadas aparecerão aqui.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="flex flex-col items-stretch">
                <div
                  className={`rounded-2xl p-4 shadow-sm space-y-2.5 border ${
                    item.status === 'failed'
                      ? 'bg-danger/10 border-danger/20 text-foreground'
                      : 'bg-accent/10 border-accent/20 text-foreground'
                  }`}
                >
                  {/* Header do Card de Disparo */}
                  <div className="flex items-center justify-between gap-3 text-xs pb-1.5 border-b border-foreground/5">
                    <span className="font-semibold flex items-center gap-1.5 text-accent">
                      <Rocket className="w-3.5 h-3.5" />
                      {item.campaign_title || 'Disparo'}
                    </span>
                    <span className="text-muted flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.timestamp)}
                    </span>
                  </div>

                  {/* Foto se houver */}
                  {item.media_url && (
                    <div className="rounded-xl overflow-hidden border border-border/60 max-w-xs max-h-48 bg-black/40">
                      <img
                        src={item.media_url}
                        alt="Mídia disparada"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Texto do Disparo */}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {item.text || <span className="text-muted italic">[Apenas foto enviada]</span>}
                  </div>

                  {/* Status do Envio */}
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-foreground/5">
                    <span className="text-muted">Status do Disparo:</span>
                    <div>
                      {item.status === 'sent' || item.status === 'responded' ? (
                        <span className="text-accent flex items-center gap-1 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Disparo realizado com sucesso
                        </span>
                      ) : item.status === 'failed' ? (
                        <div className="text-danger flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Falha: {item.error || 'Erro no envio'}</span>
                        </div>
                      ) : (
                        <span className="text-muted flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Pendente / Na fila
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border/60 bg-surface/40 flex items-center justify-between">
          <button onClick={onClose} className="btn btn-secondary text-sm">
            Fechar
          </button>

          {onOpenDirectSend && (
            <button
              onClick={() => {
                onClose();
                onOpenDirectSend(contact);
              }}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Enviar Nova Mensagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
