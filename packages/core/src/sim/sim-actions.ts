// packages/core/src/sim/sim-actions.ts — kenh gia lap NHOM, phan "giao hang" (SPEC-P02
// ke hoach 02 §7.2). `applySimOutbox()` thay cho "queued → sent" tran: voi moi hang
// `queued` theo thu tu id, text nhom → `sent` + dong dem nhan msgId gia; `action` →
// thi hanh tren DB gia lap (khong co Zalo, khong co worker). Pacer/ngan sach KHONG mo
// phong o day (do rieng bang `simulatePacer`), nhung ghi `sent_at=now()` de cau dem
// ngan sach (01-CONTRACTS §8.4) chay duoc tren DB sim.
//
// Co y TAI HIEN loi zaloclaw de test bat: `delete_message` voi `uidFrom` khac nguoi
// gui goc ⇒ `failed` (`result.error='uidFrom_mismatch'`), giong Zalo that tu choi.

import { sql } from '../adapters/db.js';
import { audit } from '../services/audit.js';

interface ClaimedRow {
  id: number;
  zalo_account_id: string;
  thread_id: string;
  thread_type: 'user' | 'group';
  kind: string;
  body: Record<string, unknown>;
}

interface ActionOutcome {
  ok: boolean;
  result: Record<string, unknown>;
}

export interface ApplySimResult {
  /** So hang da chuyen `sent`. */
  delivered: number;
  /** So hang `action` bi `failed` (vd uidFrom_mismatch). */
  failed: number;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function fail(error: string): ActionOutcome {
  return { ok: false, result: { error } };
}

/** Thi hanh MOT action tren DB gia lap. Khong nem loi nghiep vu — tra `ok=false` + `result.error`. */
async function applyAction(row: ClaimedRow): Promise<ActionOutcome> {
  const b = row.body;
  const account = row.zalo_account_id;
  const thread = row.thread_id;
  switch (b.action) {
    case 'delete_message': {
      const msgId = str(b.msgId);
      const uidFrom = str(b.uidFrom);
      const cliMsgId = str(b.cliMsgId);
      if (!msgId || !uidFrom || !cliMsgId) return fail('cli_msg_id_missing');
      if (cliMsgId === msgId) return fail('cli_msg_id_suspect'); // doan bang msgId (zaloclaw tool.ts:743)
      const found = await sql<{ sender_uid: string; cli_msg_id: string | null }>(
        `select sender_uid, cli_msg_id from group_messages where zalo_account_id=$1 and thread_id=$2 and zalo_msg_id=$3`,
        [account, thread, msgId]
      );
      if (found.length === 0) return fail('message_not_found');
      if (found[0]!.sender_uid !== uidFrom) return fail('uidFrom_mismatch');
      if (found[0]!.cli_msg_id !== cliMsgId) return fail('cli_msg_id_mismatch'); // Zalo that tu choi cliMsgId sai
      await sql(
        `update group_messages set deleted_at = coalesce(deleted_at, now())
         where zalo_account_id=$1 and thread_id=$2 and zalo_msg_id=$3`,
        [account, thread, msgId]
      );
      return { ok: true, result: { status: 0 } };
    }
    case 'remove_member':
    case 'block_member': {
      const uid = str(b.uid);
      if (!uid) return fail('invalid_action_body');
      await sql(
        `update group_members set left_at = coalesce(left_at, now())
         where zalo_account_id=$1 and thread_id=$2 and zalo_uid=$3`,
        [account, thread, uid]
      );
      if (b.action === 'block_member') {
        await sql(
          `update zalo_groups set deny_users = array_append(deny_users, $3::text), updated_at = now()
           where zalo_account_id=$1 and thread_id=$2 and not ($3::text = any(deny_users))`,
          [account, thread, uid]
        );
      }
      return { ok: true, result: b.action === 'remove_member' ? { errorMembers: [] } : {} };
    }
    case 'unblock_member': {
      const uid = str(b.uid);
      if (!uid) return fail('invalid_action_body');
      await sql(
        `update zalo_groups set deny_users = array_remove(deny_users, $3::text), updated_at = now()
         where zalo_account_id=$1 and thread_id=$2`,
        [account, thread, uid]
      );
      return { ok: true, result: {} };
    }
    case 'review_join': {
      const uids = Array.isArray(b.uids) ? b.uids.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
      if (uids.length === 0 || typeof b.approve !== 'boolean') return fail('invalid_action_body');
      const result: Record<string, unknown> = {};
      for (const uid of uids) {
        const pending = await sql<{ display_name: string | null }>(
          `update join_requests set decision = $4, decided_by = 'sim', decided_at = now()
           where zalo_account_id=$1 and thread_id=$2 and zalo_uid=$3 and decision = 'pending'
           returning display_name`,
          [account, thread, uid, b.approve ? 'approved' : 'rejected']
        );
        if (b.approve) {
          await sql(
            `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name)
             values ($1,$2,$3,'member',$4)
             on conflict (zalo_account_id, thread_id, zalo_uid)
             do update set left_at = null, display_name = coalesce(excluded.display_name, group_members.display_name)`,
            [account, thread, uid, pending[0]?.display_name ?? null]
          );
        }
        result[uid] = 0;
      }
      return { ok: true, result };
    }
    case 'sync_group_info': {
      const g = await sql<{ name: string | null; bot_is_admin: boolean }>(
        `update zalo_groups set last_synced_at = now() where zalo_account_id=$1 and thread_id=$2 returning name, bot_is_admin`,
        [account, thread]
      );
      const members = await sql<{ zalo_uid: string; display_name: string | null; role: string }>(
        `select zalo_uid, display_name, role from group_members
         where zalo_account_id=$1 and thread_id=$2 and left_at is null order by zalo_uid`,
        [account, thread]
      );
      return {
        ok: true,
        result: {
          name: g[0]?.name ?? '',
          adminIds: members.filter((m) => m.role === 'moderator').map((m) => m.zalo_uid),
          creatorId: '',
          members: members.map((m) => ({ uid: m.zalo_uid, displayName: m.display_name ?? '' })),
          total: members.length,
        },
      };
    }
    case 'create_poll':
      return { ok: true, result: { poll_id: row.id } };
    case 'create_reminder':
      return { ok: true, result: { id: `sim-rem-${row.id}` } };
    case 'create_note':
      return { ok: true, result: { id: `sim-note-${row.id}` } };
    case 'lock_poll':
    case 'remove_reminder':
    case 'update_group_settings':
      return { ok: true, result: {} };
    default:
      return fail('unknown_action');
  }
}

/** `approvals` approved ⇒ executed | failed (01-CONTRACTS §5.1) cho hanh dong chay o kenh gia lap. */
async function completeApproval(approvalId: string, ok: boolean, result: Record<string, unknown>): Promise<void> {
  const to = ok ? 'executed' : 'failed';
  const rows = await sql<{ id: string }>(
    `update approvals set status = $2, executed_at = now(), result = $3::jsonb
     where id = $1::uuid and status = 'approved' returning id`,
    [approvalId, to, JSON.stringify(result)]
  );
  if (rows.length > 0) {
    await audit(sql, { actorType: 'system', actorId: 'sim', action: `approval.${to}`, target: approvalId, data: { ok } });
  }
}

/** Giao het (toi da `limit`) hang `queued` cua thread `sim-*` da den han (`not_before <= now()`), theo thu tu id —
 * KHONG cham hang thread that khi `DATA_MODE=sim` chay chung worker that (D29 diem 6). Ngoai le CO CHU Y:
 * `extraThreadIds` — `runScenario` truyen dung cac thread cua kich ban dang phat lai (vd `u-101` o `echo.jsonl`). Moi hang duoc "nhan" (`sending`) bang
 * `for update skip locked` nen hai lan goi dong thoi khong giao trung. */
export async function applySimOutbox(opts: { limit?: number; extraThreadIds?: string[] } = {}): Promise<ApplySimResult> {
  const limit = opts.limit ?? 100;
  const claimed = await sql<ClaimedRow>(
    `update outbox set status = 'sending', attempts = coalesce(attempts, 0) + 1
     where id in (
       select id from outbox
       where status = 'queued' and (thread_id like 'sim-%' or thread_id = any($2::text[])) and not_before <= now()
       order by id limit $1 for update skip locked)
     returning id::int as id, zalo_account_id, thread_id, thread_type, kind, body`,
    [limit, opts.extraThreadIds ?? []]
  );
  claimed.sort((a, b) => a.id - b.id);

  let delivered = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      if (row.kind === 'action') {
        const out = await applyAction(row);
        const approvalId = str(row.body.approvalId);
        if (out.ok) {
          await sql(`update outbox set status = 'sent', sent_at = now(), result = $2::jsonb where id = $1`, [
            row.id,
            JSON.stringify(out.result),
          ]);
          delivered++;
        } else {
          await sql(
            `update outbox set status = 'failed', result = $2::jsonb,
               body = body || jsonb_build_object('fail_reason', $3::text) where id = $1`,
            [row.id, JSON.stringify(out.result), String(out.result.error)]
          );
          failed++;
        }
        if (approvalId) await completeApproval(approvalId, out.ok, out.result);
        continue;
      }
      const msgId = `sim-out-${row.id}`;
      await sql(`update outbox set status = 'sent', zalo_msg_id = $2, sent_at = now() where id = $1`, [row.id, msgId]);
      if (row.kind === 'text' && row.thread_type === 'group') {
        // core chen dong dem `out-<id>` ngay khi enqueue (SPEC-P03 §4.2): doi sang msgId gia.
        await sql(
          `update group_messages set zalo_msg_id = $3 where zalo_account_id = $1 and zalo_msg_id = 'out-' || $2::text`,
          [row.zalo_account_id, row.id, msgId]
        );
      }
      delivered++;
    } catch (err) {
      await sql(
        `update outbox set status = 'failed', result = $2::jsonb, body = body || jsonb_build_object('fail_reason', 'sim_error') where id = $1`,
        [row.id, JSON.stringify({ error: err instanceof Error ? err.name : 'sim_error' })]
      );
      failed++;
    }
  }
  return { delivered, failed };
}
