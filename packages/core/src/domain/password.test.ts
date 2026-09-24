import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password (scrypt)', () => {
  it('bam roi verify dung mat khau => true', async () => {
    const hash = await hashPassword('mat-khau-manh-123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('mat-khau-manh-123', hash)).toBe(true);
  });

  it('verify sai mat khau => false', async () => {
    const hash = await hashPassword('mat-khau-manh-123');
    expect(await verifyPassword('sai-mat-khau', hash)).toBe(false);
  });
});
