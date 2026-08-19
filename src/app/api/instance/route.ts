import { NextResponse } from 'next/server';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://evo.kikito.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'teste';

// GET /api/instance — Retorna o status de conexão da instância do WhatsApp
export async function GET() {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`,
      {
        headers: { apikey: EVOLUTION_API_KEY },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        instanceName: EVOLUTION_INSTANCE,
        state: 'error',
        connected: false,
        message: `Erro ao consultar status da instância (HTTP ${res.status})`,
      });
    }

    const data = await res.json();
    const state = data?.instance?.state || 'close';

    return NextResponse.json({
      instanceName: EVOLUTION_INSTANCE,
      state,
      connected: state === 'open',
      apiUrl: EVOLUTION_API_URL,
    });
  } catch (err) {
    return NextResponse.json({
      instanceName: EVOLUTION_INSTANCE,
      state: 'error',
      connected: false,
      message: err instanceof Error ? err.message : 'Falha na conexão com a Evolution API',
    });
  }
}
