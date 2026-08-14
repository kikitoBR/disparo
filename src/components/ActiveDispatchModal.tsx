'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  StopCircle,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  RefreshCw,
  Rocket,
  AlertTriangle,
  ChevronRight,
  ImageIcon,
} from 'lucide-react';
import type { Campaign } from '@/lib/types';

interface DispatchLogItem {
  id: string;
  phone: string;
  name?: string;
  status: 'sent' | 'failed' | 'info';
  timestamp: string;
  message: string;
  error?: string | null;
}

interface ActiveDispatchModalProps {
  campaign: Campaign;
  onClose: () => void;
  onCampaignUpdated: () => void;
}

export function ActiveDispatchModal({
  campaign,
  onClose,
  onCampaignUpdated,
}: ActiveDispatchModalProps) {
  const [status, setStatus] = useState<'running' | 'paused' | 'completed' | 'cancelled'>(
    campaign.status === 'paused' ? 'paused' : 'running'
  );
  const [sentCount, setSentCount] = useState(campaign.sent_count || 0);
  const [failedCount, setFailedCount] = useState(campaign.failed_count || 0);
  const [totalTargets] = useState(campaign.total_targets || 1);
  const [logs, setLogs] = useState<DispatchLogItem[]>([]);
  const [currentAction, setCurrentAction] = useState<string>('Iniciando motor de disparo...');
  const [countdown, setCountdown] = useState<number | null>(null);

  const isRunningRef = useRef(status === 'running');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Mantém a ref sincronizada com o estado
  useEffect(() => {
    isRunningRef.current = status === 'running';
  }, [status]);

  const addLog = useCallback(
    (item: Omit<DispatchLogItem, 'id' | 'timestamp'>) => {
      const newEntry: DispatchLogItem = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        ...item,
      };
      setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
    },
    []
  );

  // Função para executar 1 passo do disparo
  const executeStep = useCallback(async () => {
    if (!isRunningRef.current) return;

    setCurrentAction('⚡ Enviando mensagem para o próximo contato...');
    setCountdown(null);

    try {
      const res = await fetch('/api/dispatch/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        addLog({
          phone: 'Sistema',
          status: 'failed',
          message: `Erro na API: ${data.error || 'Erro desconhecido'}`,
        });
        // Tenta novamente após um delay maior de segurança
        if (isRunningRef.current) {
          startCountdown(15);
        }
        return;
      }

      // Se a campanha foi concluída
      if (data.done) {
        setStatus('completed');
        isRunningRef.current = false;
        setCurrentAction('🎉 Disparo finalizado com sucesso!');
        addLog({
          phone: 'Disparo',
          status: 'info',
          message: `Todos os contatos foram processados! Enviados: ${data.sent_count}, Falhas: ${data.failed_count}`,
        });
        onCampaignUpdated();
        return;
      }

      // Atualiza contadores
      setSentCount(data.sent_count);
      setFailedCount(data.failed_count);

      // Registra no feed
      const displayName = data.contact_name ? `${data.contact_name} (${data.phone_e164})` : data.phone_e164;
      if (data.status === 'sent') {
        addLog({
          phone: data.phone_e164,
          name: data.contact_name,
          status: 'sent',
          message: `Enviado com sucesso para ${displayName}`,
        });
      } else {
        addLog({
          phone: data.phone_e164,
          name: data.contact_name,
          status: 'failed',
          message: `Falha ao enviar para ${displayName}`,
          error: data.error,
        });
      }

      // Se ainda restam contatos e estamos rodando, sorteia o delay e inicia contagem regressiva
      if (isRunningRef.current) {
        const min = campaign.delay_min || 15;
        const max = campaign.delay_max || 40;
        const delaySeconds = Math.floor(Math.random() * (max - min + 1)) + min;
        startCountdown(delaySeconds);
      }
    } catch (err) {
      addLog({
        phone: 'Erro',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Falha na requisição',
      });
      if (isRunningRef.current) {
        startCountdown(15);
      }
    }
  }, [campaign.id, campaign.delay_min, campaign.delay_max, addLog, onCampaignUpdated]);

  // Contagem regressiva com delay entre envios
  const startCountdown = useCallback(
    (seconds: number) => {
      let current = seconds;
      setCountdown(current);
      setCurrentAction(`⏳ Aguardando ${current}s para o próximo envio de segurança...`);

      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      countdownIntervalRef.current = setInterval(() => {
        if (!isRunningRef.current) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return;
        }

        current -= 1;
        setCountdown(current);
        setCurrentAction(`⏳ Aguardando ${current}s para o próximo envio de segurança...`);

        if (current <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setCountdown(null);
          executeStep();
        }
      }, 1000);
    },
    [executeStep]
  );

  // Inicializa o motor
  useEffect(() => {
    if (status === 'running') {
      executeStep();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Controles de Pausa / Retomada / Cancelamento
  const handlePause = async () => {
    setStatus('paused');
    isRunningRef.current = false;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    setCurrentAction('⏸️ Disparo pausado pelo usuário.');

    await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaign.id, action: 'pause' }),
    }).catch(() => {});

    onCampaignUpdated();
  };

  const handleResume = async () => {
    setStatus('running');
    isRunningRef.current = true;
    setCurrentAction('▶️ Retomando disparo...');

    await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaign.id, action: 'resume' }),
    }).catch(() => {});

    executeStep();
    onCampaignUpdated();
  };

  const handleCancel = async () => {
    if (!confirm('Deseja realmente cancelar este disparo? Os contatos não enviados serão cancelados.')) return;

    setStatus('cancelled');
    isRunningRef.current = false;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    setCurrentAction('⏹️ Disparo cancelado.');

    await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaign.id, action: 'cancel' }),
    }).catch(() => {});

    onCampaignUpdated();
  };

  // Cálculos de progresso
  const processedCount = sentCount + failedCount;
  const progressPercent = Math.min(100, Math.round((processedCount / totalTargets) * 100)) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-surface/40">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                status === 'running'
                  ? 'bg-accent/20 text-accent animate-pulse'
                  : status === 'completed'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-muted/20 text-muted'
              }`}
            >
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                {campaign.title}
                <span className={`badge badge-${status}`}>
                  {status === 'running' ? 'Em Disparo' : status === 'paused' ? 'Pausado' : status === 'completed' ? 'Finalizado' : 'Cancelado'}
                </span>
              </h3>
              <p className="text-xs text-muted">
                Grupo: <strong>{campaign.group_filter || 'Todos'}</strong> • Intervalo: {campaign.delay_min}s a {campaign.delay_max}s
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              onCampaignUpdated();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress & Live Status Banner */}
        <div className="p-5 space-y-4 border-b border-border/40 bg-surface/20">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-muted">Progresso do Disparo</span>
              <span className="text-accent font-mono">{progressPercent}% ({processedCount} de {totalTargets})</span>
            </div>
            <div className="h-3 rounded-full bg-border/80 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-accent/80 to-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Counters Grid */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-surface/60 border border-border/50">
              <span className="text-muted block text-[11px]">Total Alvos</span>
              <span className="text-base font-bold text-foreground">{totalTargets}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
              <span className="text-muted block text-[11px]">Enviados</span>
              <span className="text-base font-bold text-accent">{sentCount}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20">
              <span className="text-muted block text-[11px]">Erros</span>
              <span className="text-base font-bold text-danger">{failedCount}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface/60 border border-border/50">
              <span className="text-muted block text-[11px]">Restantes</span>
              <span className="text-base font-bold text-muted">{Math.max(0, totalTargets - processedCount)}</span>
            </div>
          </div>

          {/* Current Live Action / Countdown */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-smooth ${
              status === 'running'
                ? countdown !== null
                  ? 'bg-info/10 border-info/20 text-info'
                  : 'bg-accent/10 border-accent/20 text-accent'
                : status === 'paused'
                ? 'bg-warning/10 border-warning/20 text-warning'
                : status === 'completed'
                ? 'bg-accent/15 border-accent/30 text-accent'
                : 'bg-danger/10 border-danger/20 text-danger'
            }`}
          >
            <span className="font-medium flex items-center gap-2">
              {status === 'running' && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              )}
              {currentAction}
            </span>

            {countdown !== null && status === 'running' && (
              <span className="text-sm font-bold font-mono px-2 py-0.5 rounded-lg bg-info/20 text-info">
                {countdown}s
              </span>
            )}
          </div>
        </div>

        {/* Live Feed Logs */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-background/50 text-xs">
          <div className="text-[11px] font-semibold text-muted flex items-center gap-1.5 pb-1">
            <Clock className="w-3.5 h-3.5 text-accent" />
            Registro de Envios em Tempo Real (últimos 50):
          </div>

          {logs.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs">
              Aguardando o primeiro envio...
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 animate-fade-in ${
                  log.status === 'sent'
                    ? 'bg-accent/5 border-accent/20 text-foreground'
                    : log.status === 'failed'
                    ? 'bg-danger/10 border-danger/20 text-foreground'
                    : 'bg-surface/40 border-border text-muted'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {log.status === 'sent' && <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0" />}
                    {log.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />}
                    {log.status === 'info' && <ChevronRight className="w-3.5 h-3.5 text-info shrink-0" />}
                    <span>{log.message}</span>
                  </div>
                  {log.error && (
                    <div className="text-[10px] text-danger/80 pl-5">{log.error}</div>
                  )}
                </div>
                <span className="text-[10px] text-muted font-mono shrink-0">{log.timestamp}</span>
              </div>
            ))
          )}
        </div>

        {/* Actions Footer with Controls */}
        <div className="p-4 border-t border-border/60 bg-surface/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {status === 'running' && (
              <button
                onClick={handlePause}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
                title="Pausar o envio com segurança"
              >
                <Pause className="w-3.5 h-3.5 text-warning" />
                Pausar Disparo
              </button>
            )}

            {status === 'paused' && (
              <button
                onClick={handleResume}
                className="btn btn-primary text-xs flex items-center gap-1.5"
                title="Retomar o disparo"
              >
                <Play className="w-3.5 h-3.5" />
                Retomar Disparo
              </button>
            )}

            {(status === 'running' || status === 'paused') && (
              <button
                onClick={handleCancel}
                className="btn btn-secondary text-xs text-danger hover:bg-danger/20 flex items-center gap-1.5"
                title="Cancelar disparos restantes"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Cancelar
              </button>
            )}
          </div>

          <button
            onClick={() => {
              onCampaignUpdated();
              onClose();
            }}
            className="btn btn-secondary text-xs"
          >
            {status === 'completed' || status === 'cancelled' ? 'Concluir & Fechar' : 'Fechar Janela (roda em 2º plano)'}
          </button>
        </div>
      </div>
    </div>
  );
}
