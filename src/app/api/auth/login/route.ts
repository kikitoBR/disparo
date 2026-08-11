import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === adminPassword) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('auth_token', adminPassword, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 dias de sessão
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Erro no servidor.' }, { status: 500 });
  }
}
