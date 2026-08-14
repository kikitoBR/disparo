'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  MessageCircle,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Phone,
  Folder,
  ImageIcon,
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
  const [stats, setStats] = useState({ total_sent: 0, total_failed: 0, total_responses: 0 });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/contacts/history?contact_id=${contact.id}&phone=${encodeURIComponent(
          contact.phone_e164
        )}`
      );
      const data = await res.json();
      if (res.ok && data.history) {
        setHistory(data.history);
        setStats({
          total_sent: data.total_sent || 0,
          total_failed: data.total_failed || 0,
          total_responses: data.total_responses || 0,
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
                {contact.name || contact.phone_e164}
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
              title="Recarregar histórico"
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
        <div className="px-5 py-3 bg-surface/20 border-b border-border/40 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-lg bg-surface/50">
            <span className="text-muted block text-[11px]">Enviadas</span>
            <span className="text-sm font-bold text-accent">{stats.total_sent}</span>
          </div>
          <div className="p-2 rounded-lg bg-surface/50">
            <span className="text-muted block text-[11px]">Respostas</span>
            <span className="text-sm font-bold text-info">{stats.total_responses}</span>
          </div>
          <div className="p-2 rounded-lg bg-surface/50">
            <span className="text-muted block text-[11px]">Falhas</span>
            <span className={`text-sm font-bold ${stats.total_failed > 0 ? 'text-danger' : 'text-muted'}`}>
              {stats.total_failed}
            </span>
          </div>
        </div>

        {/* Message Feed / Timeline */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-background/50">
          {loading && history.length === 0 ? (
            <div className="py-12 text-center text-muted text-sm flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-accent" />
              <span>Carregando histórico de mensagens...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-muted text-sm space-y-2">
              <MessageCircle className="w-10 h-10 mx-auto text-muted/50" />
              <p className="font-medium text-foreground">Nenhuma mensagem registrada ainda.</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                As mensagens enviadas em disparos ou de forma avulsa para este contato aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            history.map((item) => {
              const isSent = item.type === 'sent';

              return (
                <div
                  key={item.id}
                  className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 shadow-sm space-y-2 border ${
                      isSent
                        ? item.status === 'failed'
                          ? 'bg-danger/10 border-danger/20 text-foreground'
                          : 'bg-accent/10 border-accent/20 text-foreground'
                        : 'bg-surface border-border text-foreground'
                    }`}
                  >
                    {/* Header do Balão */}
                    <div className="flex items-center justify-between gap-3 text-[11px] pb-1 border-b border-foreground/5">
                      <span className="font-semibold flex items-center gap-1">
                        {isSent ? (
                          <>
                            <Send className="w-3 h-3 text-accent" />
                            {item.campaign_title || 'Disparo'}
                          </>
                        ) : (
                          <>
                            <MessageCircle className="w-3 h-3 text-info" />
                            Resposta do Cliente
                          </>
                        )}
                      </span>
                      <span className="text-muted flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.timestamp)}
                      </span>
                    </div>

                    {/* Foto/Mídia se houver */}
                    {item.media_url && (
                      <div className="rounded-lg overflow-hidden border border-border/60 max-w-xs max-h-48">
                        <img
                          src={item.media_url}
                          alt="Mídia enviada"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Conteúdo da Mensagem */}
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {item.text || <span className="text-muted italic">[Sem texto / Apenas mídia]</span>}
                    </div>

                    {/* Status & Erro */}
                    {isSent && (
                      <div className="flex items-center justify-end gap-1.5 text-[11px] pt-1">
                        {item.status === 'sent' && (
                          <span className="text-accent flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Enviada com sucesso
                          </span>
                        )}
                        {item.status === 'responded' && (
                          <span className="text-info flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Respondida
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <div className="text-danger flex flex-col items-end gap-0.5">
                            <span className="flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3 h-3" /> Falha no envio
                            </span>
                            {item.error && (
                              <span className="text-[10px] text-danger/80 max-w-xs text-right">
                                {item.error}
                              </span>
                            )}
                          </div>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Na fila de envio
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
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
