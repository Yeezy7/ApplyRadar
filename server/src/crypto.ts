import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM 加密/解密工具
 * 用于加密存储 api_key、smtp_password 等敏感字段
 *
 * 环境变量 ENCRYPTION_KEY 必须是 64 个十六进制字符（32 字节）
 * 可通过 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) return null;
  return Buffer.from(keyHex, 'hex');
}

/**
 * 加密文本。返回格式: iv:authTag:ciphertext（均为 hex）
 * 如果 ENCRYPTION_KEY 未配置，返回原文（向后兼容）
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getKey();
  if (!key) {
    console.warn('[Crypto] ENCRYPTION_KEY 未配置，敏感数据以明文存储');
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * 解密文本。自动检测是否为加密格式（含两个冒号分隔的 hex 段）
 * 如果是明文（旧数据），直接返回
 */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  const key = getKey();
  if (!key) return ciphertext;

  // 检测是否为加密格式: iv:authTag:ciphertext
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    // 不是加密格式，视为明文（兼容旧数据）
    return ciphertext;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    if (iv.length !== IV_LENGTH) return ciphertext;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    // 解密失败，可能是旧的明文数据
    return ciphertext;
  }
}

/**
 * 检测值是否已加密
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
}
