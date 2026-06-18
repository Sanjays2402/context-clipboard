// Passphrase-based encryption for exports.
// AES-GCM 256-bit + PBKDF2 (SHA-256, 250k iters, 16-byte salt, 12-byte IV).
// Envelope is self-describing JSON, base64url-encoded fields, safe in a .json file.

export const ENCRYPTED_KIND = "context-clipboard-encrypted" as const;
export const ENVELOPE_VERSION = 1 as const;
export const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  kind: typeof ENCRYPTED_KIND;
  v: typeof ENVELOPE_VERSION;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    /** base64url-encoded salt */
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    /** base64url-encoded IV */
    iv: string;
  };
  /** base64url-encoded ciphertext (includes GCM auth tag) */
  ciphertext: string;
}

export function isEncryptedEnvelope(x: unknown): x is EncryptedEnvelope {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (e.kind !== ENCRYPTED_KIND) return false;
  if (typeof e.v !== "number") return false;
  const kdf = e.kdf as Record<string, unknown> | undefined;
  const cipher = e.cipher as Record<string, unknown> | undefined;
  if (!kdf || typeof kdf.salt !== "string") return false;
  if (!cipher || typeof cipher.iv !== "string") return false;
  if (typeof e.ciphertext !== "string") return false;
  return true;
}

// ---- base64url helpers (no padding) -----------------------------------------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- key derivation ---------------------------------------------------------

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---- public API -------------------------------------------------------------

export async function encryptJson(
  payload: unknown,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Passphrase must be at least 4 characters.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return {
    kind: ENCRYPTED_KIND,
    v: ENVELOPE_VERSION,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64Url(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: bytesToBase64Url(iv),
    },
    ciphertext: bytesToBase64Url(new Uint8Array(ctBuf)),
  };
}

export async function decryptJson<T = unknown>(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<T> {
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }
  if (envelope.kdf.name !== "PBKDF2" || envelope.kdf.hash !== "SHA-256") {
    throw new Error("Unsupported KDF in envelope.");
  }
  if (envelope.cipher.name !== "AES-GCM") {
    throw new Error("Unsupported cipher in envelope.");
  }
  const salt = base64UrlToBytes(envelope.kdf.salt);
  const iv = base64UrlToBytes(envelope.cipher.iv);
  const ct = base64UrlToBytes(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
  } catch {
    throw new Error("Wrong passphrase or corrupted file.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(plainBuf)) as T;
  } catch {
    throw new Error("Decrypted payload is not valid JSON.");
  }
}
