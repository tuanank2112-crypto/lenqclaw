// conversation.ts — che SDT truoc khi dua vao model (thuan, 0 DB).
import { describe, expect, it } from 'vitest';
import { maskForModel } from './conversation.js';

describe('maskForModel', () => {
  it('che SDT, giu phan con lai', () => {
    expect(maskForModel('goi minh 0912 345 678 nhe')).toBe('goi minh [SĐT] nhe');
  });
  it('khong dong vao van ban khong co SDT', () => {
    expect(maskForModel('Claw ơi, giúp mình với')).toBe('Claw ơi, giúp mình với');
  });
});
