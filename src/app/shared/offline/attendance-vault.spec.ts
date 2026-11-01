import { importVaultKey, openVault, sealVault } from './attendance-vault';

describe('Encrypted attendance vault', () => {
  it('round-trips student data without persisting clear text or keys', async () => {
    const key = await importVaultKey(btoa('a'.repeat(32)));
    const data = { students: [{ name: 'Awa privée', status: 'ABSENT' }] };
    const sealed = await sealVault(key, '7/device', data);
    expect(Object.keys(sealed).sort()).toEqual(['ciphertext', 'iv']);
    expect(atob(sealed.ciphertext)).not.toContain('Awa');
    expect(key.extractable).toBe(false);
    expect(await openVault(key, '7/device', sealed)).toEqual(data);
  });
  it('rejects another account, a wrong key and modified ciphertext; uses fresh IVs', async () => {
    const key = await importVaultKey(btoa('a'.repeat(32)));
    const sealed = await sealVault(key, '7/device', { name: 'Awa' });
    expect((await sealVault(key, '7/device', { name: 'Awa' })).iv).not.toBe(sealed.iv);
    await expect(openVault(key, '8/device', sealed)).rejects.toThrow();
    await expect(openVault(await importVaultKey(btoa('b'.repeat(32))), '7/device', sealed)).rejects.toThrow();
    const bytes = atob(sealed.ciphertext); const tampered = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(openVault(key, '7/device', { ...sealed, ciphertext: tampered })).rejects.toThrow();
  });
});
