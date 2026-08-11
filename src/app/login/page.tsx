'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Zap, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Senha incorreta.');
      }
    } catch {
      setError('Erro ao autenticar.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0f]">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 glow-border">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Disparo WhatsApp</h1>
          <p className="text-sm text-muted">Acesso restrito ao painel de controle</p>
        </div>

        {/* Card */}
        <form onSubmit={handleLogin} className="glass-card rounded-2xl p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-accent" />
              Senha de Acesso
            </label>
            <input
              type="password"
              placeholder="Digite a senha de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-base"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-xs p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger font-medium">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !password} className="btn btn-primary w-full py-3">
            {loading ? (
              'Verificando...'
            ) : (
              <>
                Entrar no Painel
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="pt-2 text-center">
            <span className="text-xs text-muted flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              Proteção ativada via cookie seguro HttpOnly
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
