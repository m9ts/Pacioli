import { NextResponse, type NextRequest } from 'next/server';

// Rotas públicas: a landing (/) e o cadastro.
// /app/* exige sessão — sem token, volta para a landing.
const PUBLIC_PATHS = ['/', '/registrar'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get('sc_token')?.value);

  if (pathname === '/registrar') {
    if (hasToken) {
      return NextResponse.redirect(new URL('/app/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/app')) {
    if (!hasToken) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Landing (e demais páginas públicas): sempre acessível.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
