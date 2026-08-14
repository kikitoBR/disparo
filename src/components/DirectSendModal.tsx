'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send,
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  MessageCircle,
  Image as ImageIcon,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Contact, ContactMessageHistoryItem } from '@/lib/types';

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
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Histórico rápido do contato
  const [history, setHistory] = useState<ContactMessageHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega histórico se tiver contato ou telefone
  useEffect(() => {
    const targetPhone = contact?.phone_e164 || phone;
    if (targetPhone && targetPhone.length >= 10) {
      setLoadingHistory(true);
      fetch(`/api/contacts/history?phone=${encodeURIComponent(targetPhone)}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.history)) {
            setHistory(data.history);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [contact, phone]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Converte para Base64
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMediaUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!phone.trim() || (!message.trim() && !mediaUrl)) return;

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
          media_url: mediaUrl,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: data.message || 'Mensagem enviada com sucesso!' });
        setMessage('');
        setMediaUrl(null);
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
      <div className="glass-card w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-border shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-surface/40">
          <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
            <MessageCircle className="w-5 h-5 text-accent" />
            {contact ? `Enviar Mensagem para ${contact.name || contact.phone_e164}` : 'Novo Envio Avulso'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Telefone & Nome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Nome do Contato (opcional)</label>
              <input
                type="text"
                placeholder="ex: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!contact}
                className="w-full text-sm"
              />
            </div>
          </div>

          {/* Histórico Recente do Contato (Accordion) */}
          {history.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-surface/30 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-muted hover:text-foreground bg-surface/50 transition-smooth"
              >
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  Histórico de mensagens com este contato ({history.length})
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showHistory && (
                <div className="p-3 max-h-48 overflow-y-auto space-y-2 text-xs border-t border-border/50 bg-background/50">
                  {history.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-lg border ${
                        item.type === 'sent'
                          ? 'bg-accent/10 border-accent/20 ml-4'
                          : 'bg-surface border-border mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-muted mb-1">
                        <span>{item.type === 'sent' ? `📤 ${item.campaign_title || 'Enviada'}` : '📥 Resposta'}</span>
                        <span>{new Date(item.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="line-clamp-2">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mensagem de Texto */}
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Mensagem de Texto</label>
            <textarea
              placeholder="Digite sua mensagem aqui... Use {{primeiro_nome}} para personalizar."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full text-sm"
            />
            <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
              <span>Variáveis: <code className="text-accent">{"{{primeiro_nome}}"}</code>, <code className="text-accent">{"{{nome}}"}</code></span>
            </div>
          </div>

          {/* Anexo de Foto / Imagem */}
          <div>
            <label className="block text-xs font-semibold text-muted mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                Anexar Foto / Imagem (opcional)
              </span>
              {mediaUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setMediaUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-danger hover:underline text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Remover Foto
                </button>
              )}
            </label>

            {mediaUrl ? (
              <div className="relative rounded-xl border border-accent/30 bg-accent/5 p-3 flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-border/80 shrink-0 bg-black/40">
                  <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Foto selecionada para envio</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    A imagem será enviada com a mensagem acima como legenda (caption).
                  </p>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/80 hover:border-accent/50 rounded-xl p-4 text-center cursor-pointer transition-smooth bg-surface/30 hover:bg-surface/60"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <ImageIcon className="w-6 h-6 mx-auto text-muted mb-1" />
                <p className="text-xs font-medium text-foreground">Clique para escolher uma foto (JPG, PNG, WEBP)</p>
                <p className="text-[11px] text-muted mt-0.5">A foto será enviada junto com o texto</p>
              </div>
            )}
          </div>

          {/* Feedback Result */}
          {result && (
            <div
              className={`p-3 rounded-xl text-sm flex items-center gap-2 ${
                result.success
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'bg-danger/15 text-danger border border-danger/20'
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{result.message}</span>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-border/60 bg-surface/40 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary text-sm">
            Fechar
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !phone.trim() || (!message.trim() && !mediaUrl)}
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
