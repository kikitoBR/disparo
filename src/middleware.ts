import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas (login, api de auth, webhook da Evolution API e arquivos estáticos)
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhook') ||
    pathname.startsWith('/_next') ||
    pathname.includes('favicon.ico')
  ) {
    return NextResponse.next();
  }

  // Verifica se o cookie de autenticação é válido
  const authToken = request.cookies.get('auth_token')?.value;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!authToken || authToken !== adminPassword) {
    // Se for chamada de API, retorna 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    // Se for página, redireciona para a tela de login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
