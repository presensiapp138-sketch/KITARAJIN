/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilitas Kriptografi Aman untuk KITARAJIN
 * Menggunakan Web Crypto API (standar industri browser) untuk hashing SHA-256 dengan Salt.
 * Tidak ada password yang disimpan dalam teks biasa (plain text).
 */

export async function hashPassword(password: string, salt: string = 'KITARAJIN_SECURE_SALT_v1'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function verifyPassword(password: string, hash: string, salt?: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}
