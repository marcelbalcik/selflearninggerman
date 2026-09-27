/**
 * The GitHub token is published only encrypted: AES-GCM with a key derived
 * from the shared password (PBKDF2-SHA256). Works in browsers and in Node 22
 * (the setup script uses the same functions).
 */
export interface Sealed {
  salt: string;
  iv: string;
  data: string;
  iterations: number;
}

export const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function key(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(
  secret: string,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(password, salt, iterations),
    enc.encode(secret),
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
    iterations,
  };
}

/** The secret, or null when the password is wrong. */
export async function open(sealed: Sealed, password: string): Promise<string | null> {
  try {
    const k = await key(password, fromBase64(sealed.salt), sealed.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      k,
      fromBase64(sealed.data),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}
