import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { countUsers, verifyCredentials } from './users';

/**
 * Full NextAuth instance — imported by API routes and server components
 * running in the Node runtime. Extends the edge-safe `authConfig` with
 * the Credentials provider's `authorize` callback, which queries the
 * users table (and therefore cannot run in Edge middleware).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'NanoClaw',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await verifyCredentials(email, password);
        if (user) {
          return {
            id: String(user.id),
            name: user.name,
            email: user.email,
          };
        }

        // Bootstrap fallback — only active when the users table is empty.
        if (countUsers() === 0) {
          const envEmail = process.env.ADMIN_EMAIL || 'admin@nanoclaw.local';
          const envPassword = process.env.ADMIN_PASSWORD || 'changeme';
          if (email === envEmail && password === envPassword) {
            return {
              id: 'bootstrap',
              name: 'NanoClaw Admin',
              email: envEmail,
            };
          }
        }

        return null;
      },
    }),
  ],
});
