import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/listener/work') {
    return NextResponse.redirect(new URL('/listener', request.url));
  }
  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/talk', '/booking/:path*', '/listener/work'],
};
