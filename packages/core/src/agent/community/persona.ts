// packages/core/src/agent/community/persona.ts — persona + lap prompt (SPEC-P03 §7,
// 01-CONTRACTS §11). Du lieu DONG (ten nhom, ten thanh vien, dem, quote) KHONG vao system
// prompt: nam trong message `user` giua cac khung `<<<untrusted …>>>` (BB-10), moi `<` `>`
// trong ten/text doi thanh `‹` `›` de khong pha khung.
// BB-07: file nay KHONG doc ho so thanh vien — ghi chu DM duoc truyen vao tu `prepare`.

import { sql } from '../../adapters/db.js';
import { PersonaMissingError, PersonaTooLargeError } from '../../domain/errors.js';
import type { AccountId, GroupMessageRow, GroupTurnContext, PersonaBundle, Role, ToolContext } from '../../domain/types.js';
import { redactPhones } from './redact.js';
import { buildFixedSystemBlock, KIND_INSTRUCTIONS } from './prompts/system.js';

/** Tong khoi 1–6 (persona + nhom + chi muc skill) toi da — vuot => PersonaTooLargeError. */
export const PERSONA_MAX_CHARS = 24_000;
const CACHE_TTL_MS = 60_000;

type Kind = 'soul' | 'rules' | 'identity' | 'capabilities';
const KINDS: readonly Kind[] = ['soul', 'rules', 'identity', 'capabilities'];

/** Thoat ky tu cu phap regex (an toan voi co `u`). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** IDENTITY co dong `Goi ten: a; b; c` => moi `a` thanh regex co ranh gioi Unicode (CAM `\b`, G14). */
export function parseNamePatterns(identity: string): RegExp[] {
  const out: RegExp[] = [];
  for (const line of identity.split(/\r?\n/)) {
    const m = /^\s*(?:Gọi tên|Goi ten)\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;
    for (const raw of m[1]!.split(';')) {
      const name = raw.trim();
      if (!name) continue;
      const body = escapeRegex(name).replace(/\s+/g, '\\s*');
      out.push(new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu'));
    }
  }
  return out;
}

/** Ten hien thi bot lay tu dong `Ten: ...` cua IDENTITY (de WELCOME_TEMPLATE); mac dinh 'Claw'. */
export function parseBotName(identity: string): string {
  const m = /^\s*(?:Tên|Ten)\s*:\s*(.+)$/im.exec(identity);
  return m ? m[1]!.trim() : 'Claw';
}

interface CacheEntry {
  at: number;
  bundle: PersonaBundle;
}
const cache = new Map<string, CacheEntry>();

/** Xoa cache (test; dashboard doi persona co hieu luc toi da 60 s ma khong goi ham nay). */
export function invalidatePersonaCache(): void {
  cache.clear();
}

export async function loadPersonaBundle(account: AccountId, now: number = Date.now()): Promise<PersonaBundle> {
  const hit = cache.get(account);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.bundle;

  const docs = await sql<{ kind: Kind; version: number; body: string }>(
    `select kind, version, body from persona_docs where zalo_account_id = $1 and is_active`,
    [account]
  );
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  for (const k of KINDS) {
    if (!byKind.has(k)) throw new PersonaMissingError(`Thieu persona_docs active kind="${k}" cho tai khoan ${account}.`);
  }
  const skills = await sql<{ name: string; description: string }>(
    `select name, description from skill_docs where zalo_account_id = $1 and enabled order by name`,
    [account]
  );
  const bundle: PersonaBundle = {
    soul: byKind.get('soul')!.body,
    rules: byKind.get('rules')!.body,
    identity: byKind.get('identity')!.body,
    capabilities: byKind.get('capabilities')!.body,
    namePatterns: parseNamePatterns(byKind.get('identity')!.body),
    skills,
    versions: {
      soul: byKind.get('soul')!.version,
      rules: byKind.get('rules')!.version,
      identity: byKind.get('identity')!.version,
      capabilities: byKind.get('capabilities')!.version,
    },
  };
  const total = KINDS.reduce((n, k) => n + bundle[k].length, 0) + skillsIndex(bundle).length;
  if (total > PERSONA_MAX_CHARS) throw new PersonaTooLargeError(`Persona ${total} ky tu > ${PERSONA_MAX_CHARS}.`);
  cache.set(account, { at: now, bundle });
  return bundle;
}

function skillsIndex(p: Pick<PersonaBundle, 'skills'>): string {
  return p.skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}

/** Chi muc skill theo dong `- <name>: <description>` (model goi `read_skill`). */
export function renderSkillsIndex(p: Pick<PersonaBundle, 'skills'>): string {
  return skillsIndex(p);
}

/**
 * System prompt 7 khoi theo thu tu (01-CONTRACTS §11): RULES · SOUL · IDENTITY · prompt rieng
 * cua nhom (chi luot nhom) · CAPABILITIES · chi muc skill · khoi HE THONG co dinh.
 * Tong khoi 1–6 > PERSONA_MAX_CHARS => PersonaTooLargeError.
 */
export function buildSystemPrompt(persona: PersonaBundle, ctx: ToolContext, now: Date = ctx.now): string {
  const isGroup = 'group' in ctx;
  const groupPrompt = isGroup ? (ctx as GroupTurnContext).group.systemPrompt : null;
  const blocks: string[] = [
    `# RULES\n${persona.rules}`,
    `# SOUL\n${persona.soul}`,
    `# IDENTITY\n${persona.identity}`,
  ];
  if (groupPrompt && groupPrompt.trim() !== '') blocks.push(`# GROUP PROMPT\n${groupPrompt}`);
  blocks.push(`# CAPABILITIES\n${persona.capabilities}`);
  blocks.push(`# SKILLS\n${skillsIndex(persona)}`);
  const total = blocks.reduce((n, b) => n + b.length, 0);
  if (total > PERSONA_MAX_CHARS) throw new PersonaTooLargeError(`Khoi persona ${total} ky tu > ${PERSONA_MAX_CHARS}.`);
  const surface = isGroup ? 'G' : ctx.kind === 'owner_dm' ? 'O' : 'D';
  const requesterRole: Role | null = ctx.requester ? ctx.requester.role : null;
  blocks.push(`# HỆ THỐNG\n${buildFixedSystemBlock({ surface, now, requesterRole, botName: parseBotName(persona.identity) })}`);
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Khung du lieu KHONG TIN CAY (BB-10)
// ---------------------------------------------------------------------------

/** `<` `>` => `‹` `›` trong moi ten/text dua vao khung. */
export function sanitizeUntrusted(s: string): string {
  return s.replace(/</g, '‹').replace(/>/g, '›');
}

function hhmmVn(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  return t.toISOString().slice(11, 16);
}

/** MOT dong tin: `[#id uid=<uid> "Ten" HH:MM] text` (text da che SDT; tin cua bot hien `uid=BOT`). */
export function renderMessageLine(m: GroupMessageRow): string {
  const uid = m.isSelf ? 'BOT' : sanitizeUntrusted(m.senderUid);
  const name = sanitizeUntrusted(m.senderName ?? '');
  const quote = m.quoteMsgId ? ` ↪ trả lời tin ${sanitizeUntrusted(m.quoteMsgId)}` : '';
  const text = sanitizeUntrusted(redactPhones(m.text ?? ''));
  return `[#${m.id} uid=${uid} "${name}" ${hhmmVn(m.receivedAt)}${quote}] ${text}`;
}

export function renderGroupContext(ctx: Pick<GroupTurnContext, 'threadId' | 'group' | 'recent'>): string {
  const members = new Set(ctx.recent.map((r) => r.senderUid)).size;
  const name = sanitizeUntrusted(ctx.group.name ?? '');
  return [
    `<<<untrusted group_context thread=${sanitizeUntrusted(ctx.threadId)}>>>`,
    `tên nhóm: "${name}" · thành viên trong đệm: ${members} · bot là phó nhóm: ${ctx.group.botIsAdmin ? 'có' : 'không'} · chế độ: ${ctx.group.mode}`,
    '<<<end>>>',
  ].join('\n');
}

export function renderRecentMessages(recent: readonly GroupMessageRow[]): string {
  return [`<<<untrusted recent_messages n=${recent.length} (mới nhất cuối)>>>`, ...recent.map(renderMessageLine), '<<<end>>>'].join('\n');
}

export function renderFocus(focus: readonly GroupMessageRow[]): string {
  return ['<<<untrusted focus>>>', ...focus.map(renderMessageLine), '<<<end>>>'].join('\n');
}

/** Message `user` dau tien cua luot nhom (SPEC-P03 §6.1): 3 khung + chi dan theo `kind`. */
export function buildGroupUserMessage(ctx: GroupTurnContext, extra?: string): string {
  const parts = [renderGroupContext(ctx), renderRecentMessages(ctx.recent), renderFocus(ctx.focusMessages)];
  if (extra) parts.push(extra);
  const instruction = KIND_INSTRUCTIONS[ctx.kind];
  if (instruction) parts.push(instruction);
  return parts.join('\n');
}

/** Khoi tri nho DM (D22) — dung DAU tin hien tai, chi khi co du lieu. */
export function renderMemberBlocks(args: {
  notes: string | null;
  openLead: { status: string; score: number; missing: string[] } | null;
}): string {
  const out: string[] = [];
  if (args.notes && args.notes.trim() !== '') {
    out.push('<<<untrusted member_notes>>>', sanitizeUntrusted(args.notes.trim()), '<<<end>>>');
  }
  if (args.openLead) {
    out.push(`<<<lead status=${args.openLead.status} score=${args.openLead.score} missing=${args.openLead.missing.join(',')}>>>`, '<<<end>>>');
  }
  return out.join('\n');
}
