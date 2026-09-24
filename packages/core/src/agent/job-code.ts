// packages/core/src/agent/job-code.ts — sinh ma cuoc "C-xxxx" (01-CONTRACTS
// §4 cot jobs.code, SPEC-P03 §10.3): 4 ky tu tu bang chu khong nham lan.

import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJobCode(): string {
  const bytes = randomBytes(4);
  let out = 'C-';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
