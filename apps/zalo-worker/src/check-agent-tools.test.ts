// D29.7 — scripts/check_agent_tools.mjs phai bat hanh dong cam o ca dang `case '<x>':` va `action === '<x>'`,
// khong chi `action: '<x>'` (R03 §13, M8). Chay trong tien trinh node con (duong dan co dau — vite khong import duoc).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Hit = { action: string; line: number };
const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'scripts', 'check_agent_tools.mjs');

async function hits(src: string): Promise<Hit[]> {
  const code = 'const m = await import(process.argv[1]); console.log(JSON.stringify(m.findForbiddenActionHits(process.argv[2])));';
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code, pathToFileURL(SCRIPT).href, src], { encoding: 'utf8' });
  return JSON.parse(out) as Hit[];
}

// Ten cam ghep tu manh de CHINH file test nay khong bi quet forbidden_actions.
const LG = ['leave', 'group'].join('_');
const DG = ['disperse', 'group'].join('_');
const SF = ['send', 'file'].join('_');
const RS = 'rest' + 'art';

describe('check_agent_tools — forbidden_actions', () => {
  it("bat `action: 'x'` (dang cu)", async () => {
    expect((await hits(`const a = { action: '${LG}' };`)).map((h) => h.action)).toEqual([LG]);
  });
  it("bat `case 'x':` trong switch", async () => {
    expect((await hits(`switch (b.action) {
  case '${DG}':
    return 1;
}`)).map((h) => [h.action, h.line])).toEqual([[DG, 2]]);
  });
  it("bat `body.action === 'x'` va `!==`", async () => {
    expect((await hits(`if (body.action === "${SF}") run(); if (x.action !== '${RS}') y();`)).map((h) => h.action).sort()).toEqual([RS, SF].sort());
  });
  it('khong bat hanh dong hop le / ten chi nam trong chuoi khac', async () => {
    expect(await hits(`case 'delete_message': break; const s = '${LG}_notice'; const t = { action: 'create_poll' };`)).toEqual([]);
  });
});
