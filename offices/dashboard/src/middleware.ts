// Edge-safe middleware: uses `authConfig` (no DB imports) so it can run in
// the Edge runtime. The real credential validation happens in `auth.ts`
// under the Node runtime, invoked by API routes.
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/offices/:path*',
    '/agents/:path*',
    '/pipelines/:path*',
    '/activity/:path*',
    '/costs/:path*',
    '/users/:path*',
    '/schedules/:path*',
    '/secrets/:path*',
  ],
};
