/**
 * Dashboard users: CRUD against the `users` table in the shared NanoClaw
 * SQLite database.
 *
 * Every user has full access to every page — there is no role/permission
 * system for now. We only authenticate (is this a real account?) and
 * gate pages via the existing NextAuth middleware.
 */

import bcrypt from 'bcryptjs';
import { getWritableDb } from './db';

const BCRYPT_ROUNDS = 10;

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

/** Total count — used to trigger the env-var bootstrap when zero. */
export function countUsers(): number {
  const db = getWritableDb();
  if (!db) return 0;
  const row = db
    .prepare('SELECT COUNT(*) as count FROM users')
    .get() as { count: number };
  return row.count;
}

export function listUsers(): User[] {
  const db = getWritableDb();
  if (!db) return [];
  const rows = db
    .prepare(
      'SELECT id, email, password_hash, name, created_at, updated_at, last_login_at FROM users ORDER BY created_at ASC',
    )
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function findUserByEmail(email: string): UserRow | null {
  const db = getWritableDb();
  if (!db) return null;
  const row = db
    .prepare(
      'SELECT id, email, password_hash, name, created_at, updated_at, last_login_at FROM users WHERE lower(email) = lower(?)',
    )
    .get(email) as UserRow | undefined;
  return row ?? null;
}

export function findUserById(id: number): User | null {
  const db = getWritableDb();
  if (!db) return null;
  const row = db
    .prepare(
      'SELECT id, email, password_hash, name, created_at, updated_at, last_login_at FROM users WHERE id = ?',
    )
    .get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name || !input.password) {
    throw new Error('Email, name, and password are required');
  }
  if (input.password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (findUserByEmail(email)) {
    throw new Error('A user with this email already exists');
  }

  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(email, hash, name, now, now);

  const user = findUserById(result.lastInsertRowid as number);
  if (!user) throw new Error('Failed to create user');
  return user;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  password?: string;
}

export async function updateUser(
  id: number,
  input: UpdateUserInput,
): Promise<User> {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');

  const existing = findUserById(id);
  if (!existing) throw new Error('User not found');

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error('Email cannot be empty');
    // Reject collision unless it's the same user
    const dup = findUserByEmail(email);
    if (dup && dup.id !== id) {
      throw new Error('A user with this email already exists');
    }
    fields.push('email = ?');
    values.push(email);
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Name cannot be empty');
    fields.push('name = ?');
    values.push(name);
  }

  if (input.password !== undefined && input.password.length > 0) {
    if (input.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    fields.push('password_hash = ?');
    values.push(hash);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );

  const updated = findUserById(id);
  if (!updated) throw new Error('Failed to load updated user');
  return updated;
}

export function deleteUser(id: number): boolean {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Verify the supplied password against a user's stored hash. Returns the
 * user on success (password valid) and `null` otherwise — used by the
 * NextAuth `authorize` callback.
 *
 * On success also bumps `last_login_at`.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const row = findUserByEmail(email);
  if (!row) return null;

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;

  const db = getWritableDb();
  if (db) {
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
      now,
      row.id,
    );
  }

  return rowToUser({ ...row, last_login_at: new Date().toISOString() });
}
