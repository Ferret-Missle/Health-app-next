import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// AES-256-GCM encryption for OAuth tokens at rest (R4). The key comes from
// TOKEN_ENCRYPTION_KEY (any string; hashed to 32 bytes). Encrypted values are
// stored as "enc:v1:<iv b64>:<tag b64>:<ciphertext b64>".

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  // Normalize any-length secret to a 32-byte key.
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

/**
 * Decrypt a stored value. Backward-compatible: values not in the enc:v1 format
 * (e.g. legacy plaintext rows saved before encryption) are returned unchanged,
 * so existing links keep working until the token is next re-saved.
 */
export function decrypt(value: string | null): string | null {
  if (value == null) return value
  if (!value.startsWith(PREFIX)) return value  // legacy plaintext

  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return dec.toString('utf8')
}

/** Encrypt a value that may be null (passes null through). */
export function encryptNullable(value: string | null): string | null {
  return value == null ? null : encrypt(value)
}
