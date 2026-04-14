/**
 * Edge-safe NextAuth configuration.
 *
 * This module is the one imported by `middleware.ts`. The middleware runs
 * in the Edge runtime where native Node modules (better-sqlite3, etc.)
 * cannot be loaded, so this file MUST NOT import anything that transitively
 * pulls in `better-sqlite3`, `fs`, `path`, or other Node-only code.
 *
 * The real `authorize` callback (which queries the users table) lives in
 * `auth.ts`, imported only by API routes and server components that run
 * under the Node runtime.
 *
 * Credentials provider is still declared here (without `authorize`) so
 * NextAuth can route the sign-in form to it. The actual credential check
 * happens server-side via the Node-runtime handlers in `auth.ts`.
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    authorized({ auth }) {
      // Middleware gate: any valid session is enough. Individual API routes
      // still do their own `auth()` check.
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
};
