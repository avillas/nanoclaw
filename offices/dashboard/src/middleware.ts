export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: ['/dashboard/:path*', '/offices/:path*', '/agents/:path*', '/pipelines/:path*', '/activity/:path*', '/costs/:path*'],
};
