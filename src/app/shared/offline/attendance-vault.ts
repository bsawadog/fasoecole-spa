import { InjectionToken } from '@angular/core';

/** Only ciphertext and an IV are persisted. No key or clear-text student data. */
export interface SealedVault { iv: string; ciphertext: string; }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export async function importVaultKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', decode(value), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealVault(key: CryptoKey, owner: string, data: unknown): Promise<SealedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner) }, key, new TextEncoder().encode(JSON.stringify(data)));
  // Avoid argument limits for large class lists.
  let binary = ''; for (const byte of new Uint8Array(ciphertext)) binary += String.fromCharCode(byte);
  return { iv: encode(iv), ciphertext: btoa(binary) };
}
export async function openVault<T>(key: CryptoKey, owner: string, sealed: SealedVault): Promise<T> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv), additionalData: new TextEncoder().encode(owner) }, key, decode(sealed.ciphertext));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export async function vaultStore(owner: string, value?: SealedVault): Promise<SealedVault | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fasoecole-attendance-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vaults');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('vaults', value ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('vaults');
      const operation = value ? store.put(value, owner) : store.get(owner);
      transaction.oncomplete = () => { db.close(); resolve(value ?? operation.result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

export const ATTENDANCE_VAULT = new InjectionToken('AttendanceVault', {
  providedIn: 'root', factory: () => ({ importVaultKey, openVault, sealVault, vaultStore }),
});
