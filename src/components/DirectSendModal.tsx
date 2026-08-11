'use client';

import { useState } from 'react';
import { Send, X, RefreshCw, CheckCircle, AlertCircle, MessageCircle } from 'lucide-react';
import type { Contact } from '@/lib/types';

interface DirectSendModalProps {
  contact?: Contact | null;
  initialPhone?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DirectSendModal({ contact, initialPhone = '', onClose, onSuccess }: DirectSendModalProps) {
  const [phone, setPhone] = useState(contact?.phone_e164 || initialPhone);
  const [name, setName] = useState(contact?.name || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!phone.trim() || !message.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/contacts/send-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message,
          contact_id: contact?.id,
          contact_name: name,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: data.message || 'Mensagem enviada com sucesso!' });
        setMessage('');
        if (onSuccess) onSuccess();
      } else {
        setResult({ success: false, message: data.error || 'Erro ao enviar mensagem.' });
      }
    } catch {
      setResult({ success: false, message: 'Erro de conexão com o servidor.' });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-lg rounded-2xl p-6 space-y-5 border border-border shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
            <MessageCircle className="w-5 h-5 text-accent" />
            {contact ? `Enviar Mensagem Avulsa para ${contact.name || contact.phone_e164}` : 'Novo Envio Avulso'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Telefone (DDD + Número)</label>
            <input
              type="text"
              placeholder="ex: 21999998888 ou 5521999998888"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!!contact}
              className="w-full text-sm font-mono"
            />
          </div>

          {!contact && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Nome do Contato (opcional)</label>
              <input
                type="text"
                placeholder="ex: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Mensagem</label>
            <textarea
              placeholder="Digite sua mensagem..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full text-sm"
            />
            <div className="text-[11px] text-muted mt-1">
              Variáveis disponíveis: <code className="text-accent">{"{{primeiro_nome}}"}</code>, <code className="text-accent">{"{{nome}}"}</code>, <code className="text-accent">{"{{telefone}}"}</code>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {result && (
          <div
            className={`p-3 rounded-xl text-sm flex items-center gap-2 ${
              result.success ? 'bg-accent/15 text-accent border border-accent/20' : 'bg-danger/15 text-danger border border-danger/20'
            }`}
          >
            {result.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border/60">
          <button onClick={onClose} className="btn btn-secondary text-sm">
            Fechar
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !phone.trim() || !message.trim()}
            className="btn btn-primary text-sm flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Enviando...' : 'Enviar Agora'}
          </button>
        </div>
      </div>
    </div>
  );
}
