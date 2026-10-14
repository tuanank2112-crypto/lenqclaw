# 01 — CONTRACTS · Khung hành vi Skill · Voice · Constraint

> Đọc sau `00-ARCHITECTURE.md`. Mọi type/DDL/hàm/route của kế hoạch 03 phải khớp file này. Đổi hợp đồng ⇒ sửa file này trước, ghi D mới vào `plan.md` §2. Hợp đồng kế hoạch 02 KHÔNG nhắc ở đây ⇒ giữ nguyên; chỗ 03 cần 02 đổi ghi ở §10 dạng "đề xuất sửa 02" (SO quyết, KHÔNG sửa file của 02 từ kế hoạch này).

## §1. Layout (chỉ phần MỚI/ĐỔI so với 02 01-CONTRACTS §1)

```text
db/migrations/010_behavior.sql                 §2 — append-only, chép NGUYÊN VĂN
packages/core/src/
  behavior/                                    THUẦN (không DB, không mạng) — test không cần Postgres
    types.ts                                   §3 (Surface, VoiceSpec, OutputPolicySpec, SkillVersionInput, ReleaseContent…)
    limits.ts                                  §5.1 PLATFORM_LIMITS, SKILL_INDEX_LIMITS (hằng — tầng 1, KHÔNG env)
    validate.ts                                validateVoiceSpec / validateOutputPolicySpec / validateSkillInput ⇒ ValidationIssue[]
    render.ts                                  renderVoiceBlock, renderSkillIndex (SPEC-P01 §3, SPEC-P02 §4)
    output-gate.ts                             compileOutputRules, checkOutput, formatViolationsForModel (SPEC-P03 §3)
    content-hash.ts                            canonicalJson, contentSha256 (SPEC-P04 §3)
    impact.ts                                  impactedSuites (SPEC-P04 §6.2)
    eval-env.ts                                assertEvalEnvironment (BB-20)
  services/behavior/
    store.ts                                   tạo phiên bản voice/policy/skill/eval_case (§4.1)
    releases.ts                                createRelease, resolveRelease, listReleases (§4.2)
    activation.ts                              activateRelease, rollbackRelease (§4.3)
    bootstrap.ts                               bootstrapTenantRelease (§4.4)
    bundle-io.ts · attest.ts                   exportBundle, importBundle, attestRelease (§4.5)
    compare.ts                                 compareReleases (SPEC-P04 §8)
  agent/community/
    behavior.ts                                loadBehavior (thay loadPersonaBundle của 02 — §4.6)
    output/send.ts                             sendAgentText, sendSystemText — điểm DUY NHẤT `enqueue` kind text (BB-15)
    output/gate-state.ts                       TurnGateState, nextGateAction (THUẦN)
    prompts/templates.ts                       TEMPLATES: Record<TemplateId, string> (dời các câu tất định của 02 `prompts/system.ts`)
scripts/check_output_gate.mjs                  BB-15 (SPEC-P03 §7)
scripts/behavior/{bootstrap,export,import,attest,activate,rollback}.mjs · scripts/release_eval.mjs (điều phối)
scripts/eval_behavior.mjs + scripts/eval/behavior/{suites/*.mjs,judge.mjs,red-*.mjs}
evals/golden/behavior/{voice,constraints,judge-calibration}.jsonl · evals/fixtures/behavior/{clean,dirty}-outputs.jsonl
apps/web: app/behavior/** · app/api/behavior/** (SPEC-P05)
```

## §2. DDL — `db/migrations/010_behavior.sql` (CHƯA áp thử — P00 áp từ rỗng sau 001–009 trên DB TẠM, chạy lại `applied 0`, ghi `evidence/P00/migration-010-probe.txt`; lệch cú pháp ⇒ dừng báo, không tự sửa nghĩa)

```sql
-- 010_behavior.sql — ke hoach 03 (Skill · Voice · Constraint, 0.2.0). Chi THEM;
-- ngoai le duy nhat: thay CHECK outcome cua turn_traces (009) de them 'gated' (D08).

-- 0. Chan sua/xoa noi dung hanh vi (D05, BB-17)
create function forbid_content_change() returns trigger language plpgsql as $$
begin
  raise exception 'immutable_content: % khong duoc %', TG_TABLE_NAME, lower(TG_OP)
    using errcode = '55000';
end $$;

-- 1. Tai lieu hanh vi co cau truc theo tenant (D02, D03, D07)
create table behavior_docs (
  id bigserial primary key,
  tenant_id text not null references tenants,
  kind text not null check (kind in ('voice','output_policy')),
  version int not null check (version >= 1),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 24000),
  note text check (char_length(note) <= 300),
  created_by text not null check (created_by ~ '^(staff|cli|seed|import):'),
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, version)
);
create trigger behavior_docs_immutable before update or delete on behavior_docs
  for each row execute function forbid_content_change();

-- 2. Skill co phien ban (D06) — thay skill_docs (008), skill_docs dong bang tu 0.2.0
create table skill_versions (
  id bigserial primary key,
  tenant_id text not null references tenants,
  name text not null check (name ~ '^[a-z0-9-]{2,40}$'),
  version int not null check (version >= 1),
  description text not null check (char_length(description) between 1 and 200),
  when_to_use text not null check (char_length(when_to_use) between 12 and 200 and when_to_use like 'Dùng khi %'),
  body text not null check (char_length(body) between 1 and 8000),
  surfaces text[] not null check (cardinality(surfaces) between 1 and 3
                                  and surfaces <@ array['group','dm','owner_dm']::text[]),
  uses_tools text[] not null default '{}',
  test_cases jsonb not null default '[]' check (jsonb_typeof(test_cases) = 'array'
                                                and jsonb_array_length(test_cases) <= 30),
  created_by text not null check (created_by ~ '^(staff|cli|seed|import):'),
  created_at timestamptz not null default now(),
  unique (tenant_id, name, version)
);
create trigger skill_versions_immutable before update or delete on skill_versions
  for each row execute function forbid_content_change();

-- 3. persona_docs (008): chan sua noi dung/xoa; VAN cho UPDATE is_active (code 0.1.0 khi rollback ma — D04)
create trigger persona_docs_immutable before delete or update of zalo_account_id, kind, version, body
  on persona_docs for each row execute function forbid_content_change();

-- 4. Release = anh chup bat bien (D04)
create table behavior_releases (
  id bigserial primary key,
  tenant_id text not null references tenants,
  number int not null check (number >= 1),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  origin text not null check (origin in ('authored','bootstrap','imported')),
  note text not null check (char_length(note) between 1 and 500),
  created_by text not null check (created_by ~ '^(staff|cli|seed|import):'),
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);
create unique index behavior_releases_bootstrap_idx on behavior_releases (tenant_id) where origin = 'bootstrap';
create index behavior_releases_hash_idx on behavior_releases (tenant_id, content_sha256);
create trigger behavior_releases_immutable before update or delete on behavior_releases
  for each row execute function forbid_content_change();

-- 5. Ket qua cham tu DB eval (D11, D12)
create table eval_attestations (
  id uuid primary key,
  release_id bigint not null references behavior_releases,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  cases_sha256 text not null check (cases_sha256 ~ '^[0-9a-f]{64}$'),
  base_attestation_id uuid references eval_attestations,
  suites_run text[] not null,
  suites_inherited text[] not null default '{}',
  verdict text not null check (verdict in ('passed','failed','blocked')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  agent_model text not null,
  judge_model text not null,
  code_ref text not null check (char_length(code_ref) between 1 and 80),
  model_calls int not null check (model_calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  started_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= started_at),
  imported_by text not null check (imported_by ~ '^(staff|cli):'),
  imported_at timestamptz not null default now()
);
create index eval_attestations_release_idx on eval_attestations (release_id, imported_at desc);
create trigger eval_attestations_immutable before update or delete on eval_attestations
  for each row execute function forbid_content_change();

create table eval_outputs (
  attestation_id uuid not null references eval_attestations,
  suite text not null,
  case_id text not null,
  surface text not null check (surface in ('group','dm','owner_dm')),
  outputs text[] not null check (cardinality(outputs) <= 10
                                 and octet_length(array_to_string(outputs, '')) <= 32000),
  passed boolean not null,
  detail jsonb not null default '{}',
  primary key (attestation_id, suite, case_id)
);
create trigger eval_outputs_immutable before update or delete on eval_outputs
  for each row execute function forbid_content_change();

-- 6. Ca golden rieng tenant (D09) — chi duoc dat retired_at
create table eval_cases (
  id bigserial primary key,
  tenant_id text not null references tenants,
  suite text not null check (suite in ('voice','constraints')),
  case_id text not null check (case_id ~ '^[a-z0-9_-]{3,60}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  created_by text not null check (created_by ~ '^(staff|cli|seed|import):'),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (tenant_id, suite, case_id)
);
create trigger eval_cases_immutable before delete or update of tenant_id, suite, case_id, body
  on eval_cases for each row execute function forbid_content_change();

-- 7. Con tro release active (D13) + luat cung kich hoat (BB-18)
create table tenant_active_release (
  tenant_id text primary key references tenants,
  release_id bigint not null references behavior_releases,
  previous_release_id bigint references behavior_releases,
  activated_by text not null check (activated_by ~ '^(staff|cli|seed):'),
  activated_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 1 and 300)
);
create function check_release_activation() returns trigger language plpgsql as $$
declare r record;
begin
  select tenant_id, origin, content_sha256 into r from behavior_releases where id = new.release_id;
  if r.tenant_id is distinct from new.tenant_id then
    raise exception 'release_tenant_mismatch' using errcode = '23514';
  end if;
  if r.origin <> 'bootstrap' and not exists (
       select 1 from eval_attestations a
        where a.release_id = new.release_id
          and a.content_sha256 = r.content_sha256
          and a.verdict = 'passed') then
    raise exception 'release_not_passed' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tenant_active_release_check before insert or update on tenant_active_release
  for each row execute function check_release_activation();

-- 8. Vet luot (D15): release, cong ra, skill da doc. Khong noi dung (02 BB-14).
alter table turn_traces add column release_id bigint references behavior_releases;
alter table turn_traces add column gate_violations int not null default 0 check (gate_violations >= 0);
alter table turn_traces add column gate_rewrites int not null default 0 check (gate_rewrites between 0 and 1);
alter table turn_traces add column skills_read text[] not null default '{}';
alter table turn_traces drop constraint turn_traces_outcome_check;
alter table turn_traces add constraint turn_traces_outcome_check
  check (outcome in ('replied','silent','auto_posted','fallback','model_down','refusal','error','gated'));
create index turn_traces_release_idx on turn_traces (release_id, created_at desc) where release_id is not null;
```

Ghi chú DDL:
- Tên `turn_traces_outcome_check` là tên Postgres tự đặt cho CHECK cột ở 009 (`<bảng>_<cột>_check`). Probe P00 PHẢI in `select conname from pg_constraint where conrelid='turn_traces'::regclass` TRƯỚC khi áp 010; khác tên ⇒ dừng báo.
- `skill_docs` (008) KHÔNG có trigger bất biến: 0.1.0 sửa tại chỗ; từ 0.2.0 KHÔNG mã nào đọc/ghi `skill_docs` ngoài `bootstrap.ts` (đọc 1 lần). Dọn bảng ở GĐ3.
- `eval_cases.created_by` là chuỗi actor (không FK) để import từ bundle không phụ thuộc `staff_users` của DB khác.
- Mọi bảng mới không chứa dữ liệu cá nhân (nội dung hành vi + ca golden tổng hợp) ⇒ không cần hạn giữ ở 0.2.0; CẤM dán tin nhắn thật của thành viên vào `eval_cases` (SPEC-P05 §2).

## §3. Kiểu TypeScript (`behavior/types.ts`)

```ts
export type Surface = 'group' | 'dm' | 'owner_dm';
export const SURFACES: readonly Surface[] = ['group', 'dm', 'owner_dm'];
/** Bề mặt của một LƯỢT (để chọn khối voice + chỉ mục skill). Bề mặt ĐÍCH của một tin gửi xem SendTarget. */
export function surfaceOfTurn(kind: TurnKind, threadType: 'user' | 'group'): Surface;
// group_* ⇒ 'group' · 'dm' ⇒ 'dm' · 'owner_dm' ⇒ 'owner_dm' · 'automation' ⇒ threadType==='group' ? 'group' : 'owner_dm'

export interface VoiceSurfaceSpec {            // SPEC-P02 §2 — cột "Đo bằng" cho từng trường
  selfPronoun: string;                         // 1..20 ký tự, vd 'mình'
  addressPronoun: string;                      // 1..20, vd 'bạn'
  avoidSelfPronouns: string[];                 // 0..10 mục, mỗi 1..20 — CODE (banned_term)
  maxChars: number;                            // int, 50..PLATFORM_LIMITS.maxChars[surface] — CODE
  maxEmoji: number;                            // int, 0..5 — CODE
  formality: 1 | 2 | 3 | 4 | 5;                // 1 suồng sã … 5 trang trọng — GOLDEN
  preferTerms: Array<{ use: string; insteadOf: string[] }>;   // 0..20; insteadOf 1..5 mục — CODE (banned_term, gợi ý = use)
  avoidTerms: string[];                        // 0..50, mỗi 2..80 — CODE
  markdown: 'forbid' | 'allow';                // CODE
  toneNotes: string;                           // 0..500 — GOLDEN
  examples: Array<{ situation: string; good: string; bad: string; why: string }>;  // 2..6; mỗi trường 1..400 — prompt (2 đầu) + hiệu chuẩn máy chấm
}
export interface VoiceSpec { schema: 1; surfaces: Record<Surface, VoiceSurfaceSpec> }      // ĐỦ 3 bề mặt

export interface OutputPolicySurfaceSpec {
  bannedPhrases: string[];                                          // 0..100, mỗi 2..80 — literal
  links: { mode: 'any' | 'allowlist' | 'none'; domains: string[] }; // domains 0..30, dạng 'vd.com' (chữ thường, không scheme)
  phones: { mode: 'any' | 'allowlist' | 'none'; numbers: string[] }; // numbers 0..10, dạng '0xxxxxxxxx' (10 số)
}
export interface OutputPolicySpec { schema: 1; surfaces: Record<Surface, OutputPolicySurfaceSpec> }

export interface ValidationIssue { path: string; code: string; message: string }   // path kiểu 'surfaces.group.maxChars'

export interface SkillTestCase {               // SPEC-P01 §5
  case_id: string;                             // ^[a-z0-9_-]{3,60}$, duy nhất trong skill
  surface: Surface;
  focus: string;                               // 1..1000 — tin của người dùng
  transcript?: Array<{ uid: string; name: string; text: string; minutes_ago: number }>;  // ≤ 20 (chỉ group)
  expect_read: boolean;                        // có gọi read_skill(<tên skill này>) không
  tools_called?: string[];                     // ⊆ TOOL_NAMES
  tools_not_called?: string[];                 // ⊆ TOOL_NAMES
  rubric?: string[];                           // 0..5 tiêu chí cho máy chấm, mỗi 5..200
}
export interface SkillVersionInput {
  name: string; description: string; whenToUse: string; body: string;
  surfaces: Surface[]; usesTools: string[]; testCases: SkillTestCase[];
}
export interface SkillVersionRow extends SkillVersionInput { id: number; tenantId: string; version: number; createdBy: string; createdAt: string }

export interface ReleaseSelection {            // input createRelease — id các phiên bản
  persona: { soul: number; rules: number; identity: number; capabilities: number };   // persona_docs.id
  skills: number[];                            // skill_versions.id; tên không trùng
  voice: number;                               // behavior_docs.id (kind voice)
  outputPolicy: number;                        // behavior_docs.id (kind output_policy)
}
export type ReleaseManifest = ReleaseSelection & { schema: 1 };   // lưu ở behavior_releases.manifest

/** Nội dung đã giải — đầu vào của content hash. KHÔNG chứa id/version/thời gian (để hash khớp giữa DB vận hành và DB eval). */
export interface ReleaseContent {
  schema: 1;
  persona: { soul: string; rules: string; identity: string; capabilities: string };
  skills: SkillVersionInput[];                             // sắp theo name tăng dần
  voice: VoiceSpec;
  outputPolicy: OutputPolicySpec;
}
export interface ResolvedRelease {
  id: number; tenantId: string; number: number; origin: 'authored' | 'bootstrap' | 'imported'; note: string;
  contentSha256: string; manifest: ReleaseManifest; content: ReleaseContent;
  versions: ReleaseVersions;
}
export interface ReleaseVersions {             // ghi vào turn_traces.persona_versions (jsonb của 009)
  release: number; soul: number; rules: number; identity: number; capabilities: number;
  voice: number; outputPolicy: number; skills: Record<string, number>;
}

export type SuiteName = 'voice' | 'constraints' | 'activation' | 'recheck' | 'templates' | `skill:${string}`;

export type OutputCheck = 'max_chars' | 'max_emoji' | 'banned_term' | 'markdown' | 'link' | 'phone';
export interface Violation {
  check: OutputCheck;
  source: 'voice.avoidSelfPronouns' | 'voice.avoidTerms' | 'voice.preferTerms' | 'policy.bannedPhrases' | 'voice.maxChars' | 'voice.maxEmoji' | 'voice.markdown' | 'policy.links' | 'policy.phones';
  found: string;                               // đoạn vi phạm (≤ 80 ký tự) hoặc số đo thực
  limit?: number | string;                     // trần / danh sách cho phép rút gọn
  suggestion?: string;                         // từ preferTerms.use khi có
}
export interface GateVerdict { ok: boolean; violations: Violation[] }
export interface CompiledOutputRules { readonly surface: Surface; readonly maxChars: number; readonly maxEmoji: number;
  readonly markdownForbidden: boolean; readonly links: OutputPolicySurfaceSpec['links']; readonly phones: OutputPolicySurfaceSpec['phones'];
  readonly terms: ReadonlyArray<{ phrase: string; source: Violation['source']; suggestion?: string; re: RegExp }> }   // re do CODE dựng
```

`BehaviorBundle` (thay `PersonaBundle` của 02 §6 ở runtime — giữ đủ trường cũ để code 02 dùng được):
```ts
export interface BehaviorBundle {
  tenantId: string; release: ResolvedRelease;
  soul: string; rules: string; identity: string; capabilities: string; namePatterns: RegExp[];   // như PersonaBundle 02
  skills: Array<{ name: string; description: string; whenToUse: string; surfaces: Surface[] }>;   // chỉ mục — thân lấy qua release.content
  voice: VoiceSpec; outputPolicy: OutputPolicySpec;
  compiledRules: Record<Surface, CompiledOutputRules>;                                            // biên dịch 1 lần/bundle
  versions: ReleaseVersions;
}
```

## §4. Chữ ký hàm

### §4.1 `services/behavior/store.ts`
```ts
export type Actor = string;   // ^(staff|cli|seed|import):.+$ — sai ⇒ BehaviorSpecInvalidError
export function createVoiceVersion(tenantId: string, spec: unknown, actor: Actor, note?: string): Promise<{ id: number; version: number }>;
export function createOutputPolicyVersion(tenantId: string, spec: unknown, actor: Actor, note?: string): Promise<{ id: number; version: number }>;
export function createSkillVersion(tenantId: string, input: unknown, actor: Actor): Promise<{ id: number; version: number }>;
export function addEvalCase(tenantId: string, suite: 'voice' | 'constraints', body: unknown, actor: Actor): Promise<{ id: number }>;
export function retireEvalCase(tenantId: string, id: number, actor: Actor): Promise<void>;
```
- `version = coalesce(max(version),0)+1` trong `tx` với `select … for update` trên hàng `tenants` (tuần tự hoá theo tenant); trùng (23505) ⇒ thử lại 1 lần ⇒ `ConflictError`.
- Validate bằng `behavior/validate.ts` TRƯỚC khi chạm DB; có issue ⇒ `BehaviorSpecInvalidError(issues)`. Ghi `audit_log` (§7).

### §4.2 `services/behavior/releases.ts`
```ts
export function createRelease(tenantId: string, sel: ReleaseSelection, actor: Actor, note: string): Promise<ResolvedRelease>;
export function resolveRelease(releaseId: number): Promise<ResolvedRelease>;          // không có ⇒ NotFoundError
export function listReleases(tenantId: string, limit?: number): Promise<Array<ResolvedRelease & { latestAttestation: AttestationSummary | null; active: boolean }>>;
```
`createRelease` kiểm theo thứ tự, lỗi đầu tiên ném: (1) persona doc đúng kind + tài khoản thuộc tenant (`TenantMismatchError`); (2) skill thuộc tenant, tên không trùng; voice/policy đúng kind + tenant; (3) `uses_tools` của mỗi skill ⊆ hợp các tool được phép trên bề mặt của skill theo `TOOL_POLICY` (`BehaviorSpecInvalidError code='skill_tool_unavailable'`); (4) với MỖI bề mặt: `renderSkillIndex` ≤ `SKILL_INDEX_LIMITS` (`SkillIndexOverBudgetError`), `renderVoiceBlock` ≤ 1 500 ký tự, tổng khối prompt 1–6 ≤ 24 000 (`PersonaTooLargeError` của 02); (5) `content_sha256` trùng một release đã có của tenant ⇒ trả release đó (idempotent, không tạo mới). `number = max+1`. `origin='authored'`.

### §4.3 `services/behavior/activation.ts`
```ts
export function activateRelease(tenantId: string, releaseId: number, actor: Actor, reason: string): Promise<{ from: number | null; to: number }>;
export function rollbackRelease(tenantId: string, actor: Actor, reason: string): Promise<{ from: number; to: number }>;
```
Một `tx`: `select … from tenant_active_release where tenant_id=$1 for update`; upsert con trỏ `release_id=$new, previous_release_id=$cũ`; trigger BB-18 từ chối ⇒ map `release_not_passed` ⇒ `ReleaseNotPassedError`, `release_tenant_mismatch` ⇒ `TenantMismatchError`; cùng tx `audit_log action='release.activated'|'release.rolled_back'`. `rollbackRelease`: `previous_release_id` null ⇒ `NoPreviousReleaseError`; kích hoạt bản trước (bản trước đã từng active ⇒ đã passed/bootstrap ⇒ trigger cho qua). Kích hoạt chính release đang active ⇒ không đổi gì, trả `{from:to, to}`.

### §4.4 `services/behavior/bootstrap.ts`
```ts
export function bootstrapTenantRelease(tenantId: string): Promise<{ created: boolean; releaseId: number }>;
```
Idempotent (SPEC-P04 §2). Gọi từ `runSeed()` (sau seed persona/skill của 02) và CLI `npm run behavior:bootstrap -- --tenant default`.

### §4.5 `services/behavior/bundle-io.ts`, `attest.ts`
```ts
export interface BundleFile { schema: 1; tenantId: string; releaseNumber: number; content: ReleaseContent; contentSha256: string;
  evalCases: Array<{ suite: 'voice' | 'constraints'; case_id: string; body: unknown }>; casesSha256: string;
  base: { attestationId: string; content: ReleaseContent; metrics: Record<string, unknown>;
          outputs: Array<{ suite: string; case_id: string; surface: Surface; outputs: string[]; passed: boolean }>; codeRef: string; finishedAt: string } | null;
  exportedAt: string; codeRef: string }
export interface EvalResultFile { schema: 1; runId: string; tenantId: string; contentSha256: string; casesSha256: string;
  baseAttestationId: string | null; suitesRun: SuiteName[]; suitesInherited: SuiteName[]; verdict: 'passed' | 'failed' | 'blocked';
  metrics: Record<string, unknown>; outputs: Array<{ suite: string; case_id: string; surface: Surface; outputs: string[]; passed: boolean; detail: object }>;
  agentModel: string; judgeModel: string; codeRef: string; modelCalls: number; inputTokens: number; outputTokens: number; startedAt: string; finishedAt: string }
export function exportBundle(releaseId: number): Promise<BundleFile>;                  // base = attestation passed mới nhất của release ĐANG active (null nếu không có)
export function importBundle(b: BundleFile): Promise<{ releaseId: number }>;           // CHỈ trong DB eval (assertEvalEnvironment); origin='imported'
export function attestRelease(releaseId: number, r: EvalResultFile, actor: Actor): Promise<{ attestationId: string }>;
```
`attestRelease`: `r.contentSha256 ≠ release.content_sha256` hoặc `r.tenantId ≠ release.tenant_id` ⇒ `AttestationMismatchError` (không ghi gì); trùng `runId` ⇒ `ConflictError`; ghi `eval_attestations` + `eval_outputs` trong 1 tx + audit `release.attested`.

### §4.6 `agent/community/behavior.ts`
```ts
export function loadBehavior(account: AccountId, opts?: { pinReleaseId?: number }): Promise<BehaviorBundle>;
```
Mỗi lời gọi: `select t.release_id from zalo_accounts a join tenant_active_release t using (tenant_id) where a.id=$1` (1 hàng); không có ⇒ `ReleaseMissingError`. Bundle cache trong tiến trình theo `release_id` (Map, tối đa 8 mục, LRU) — nội dung bất biến nên không cần TTL. `pinReleaseId` chỉ hợp lệ khi `DATA_MODE=sim`, khác ⇒ `ConfigError`. `loadPersonaBundle` của 02 trở thành wrapper gọi `loadBehavior` (giữ chữ ký cũ cho code 02 chưa đổi).

### §4.7 Hàm thuần (chi tiết ở SPEC từng gói)
```ts
export function validateVoiceSpec(x: unknown): ValidationIssue[];                       // SPEC-P02 §3
export function validateOutputPolicySpec(x: unknown): ValidationIssue[];                // SPEC-P03 §2
export function validateSkillInput(x: unknown): ValidationIssue[];                      // SPEC-P01 §2
export function renderVoiceBlock(surface: Surface, v: VoiceSurfaceSpec): string;        // SPEC-P02 §4
export function renderSkillIndex(skills: BehaviorBundle['skills'], surface: Surface): string;   // SPEC-P01 §3
export function compileOutputRules(surface: Surface, v: VoiceSurfaceSpec, p: OutputPolicySurfaceSpec): CompiledOutputRules;  // SPEC-P03 §3
export function checkOutput(text: string, r: CompiledOutputRules): GateVerdict;         // SPEC-P03 §3
export function formatViolationsForModel(v: Violation[]): string;                       // SPEC-P03 §4
export function canonicalJson(x: unknown): string; export function contentSha256(c: ReleaseContent): string;   // SPEC-P04 §3
export function impactedSuites(base: ReleaseContent | null, next: ReleaseContent, ctx: { baseAgeDays: number | null; sameMinor: boolean; full: boolean }): { run: SuiteName[]; inherit: SuiteName[] };  // SPEC-P04 §6.2
export function assertEvalEnvironment(env: NodeJS.ProcessEnv): void;                    // BB-20, SPEC-P04 §6.1
```

## §5. Hằng nền tảng (tầng 1 — KHÔNG env, KHÔNG cấu hình tenant)

### §5.1 `behavior/limits.ts`
```ts
export const PLATFORM_LIMITS = {
  maxChars: { group: 1800, dm: 1800, owner_dm: 4000 },   // group/dm = 1 chunk pacer (02 BB-08) ⇒ không thành chuỗi nhiều tin
  maxEmoji: 5, voiceBlockMaxChars: 1500, maxRewritesPerTurn: 1,
} as const;
export const SKILL_INDEX_LIMITS = { maxEntryChars: 300, maxIndexChars: 2400, maxSkillsPerSurface: 12, minTestCases: 8, minPositive: 5, minNegative: 3 } as const;
```

### §5.2 Template tất định (`prompts/templates.ts`)
```ts
export type TemplateId = 'FALLBACK_GROUP_REPLY' | 'MODEL_DOWN_GROUP_REPLY' | 'MODEL_DOWN_DM_REPLY' | 'BUSY_DM_REPLY' | 'COMMANDS_HELP'
  | 'WELCOME_TEMPLATE' | 'GATED_GROUP_REPLY' | 'GATED_DM_REPLY' | 'INVITE_PRIVATE' | 'HANDOFF_DM' | 'GATED_HANDOFF_DM'
  | 'APPROVAL_DM' | 'LEAD_DM' | 'NEED_DEPUTY_DM';                       // danh sách cuối cùng = mọi hằng câu tất định của 02 + 3 hằng MỚI
export const TEMPLATES: Record<TemplateId, string>;                    // biến dạng {name}; điền bằng fillTemplate (thoát ‹›)
```
MỚI: `GATED_GROUP_REPLY` = 'Câu này mình nhờ admin trả lời bạn nhé.' · `GATED_DM_REPLY` = 'Mình chuyển câu hỏi này cho người phụ trách, bạn chờ chút nhé.' · `GATED_HANDOFF_DM` = 'Cổng ra đã chặn câu trả lời ở {thread} ({surface}). Vi phạm: {violations}. Bản nháp cuối: «{draft}»' (draft ≤ 1500 ký tự, cắt cuối bằng '…').

## §6. Tool đổi so với 02 §7.1 (chữ ký input GIỮ, hành vi thêm)

| Tool | Đổi |
| :-- | :-- |
| `read_skill` `{name}` | Tra skill trong `bundle.release.content.skills` CÓ bề mặt của lượt; không có/không đúng bề mặt ⇒ `SkillNotFoundError` (không lộ skill bề mặt khác). Trả `{name, version, body, uses_tools}`. Lần 2 cùng tên trong lượt ⇒ `{name, already_loaded: true}` (không thân). Thêm `name` vào `ctx.skillsRead` (ghi `turn_traces.skills_read`, không trùng) |
| `describe_capabilities` `{}` | Danh sách skill = chỉ mục của bề mặt hiện tại (`name`, `description`) |
| `send_group_message` | Gửi qua `sendAgentText(target={surface:'group'})`; vi phạm ⇒ SPEC-P03 §4 (`OutputPolicyViolationError` lần đầu, `OutputBlockedError` lần sau) |
| `announce` (O) | Kiểm bằng luật bề mặt ĐÍCH `group` (không phải `owner_dm`); vi phạm ⇒ như trên (model viết lại trong DM chủ) |
| `schedule_automation` (O) | `action='send_text'` ⇒ `payload.text` kiểm bằng luật bề mặt đích (nhóm ⇒ `group`, không thread ⇒ `owner_dm`) LÚC TẠO; lúc chạy kiểm lại (policy có thể đã đổi) — SPEC-P03 §5.3 |
| `handoff_to_owner` `{reason}` | Không đổi input; host dùng nội bộ `handoffToOwner(ctx, 'output_blocked', {violations, draft})` gửi `GATED_HANDOFF_DM` |

Bảng `TOOL_POLICY`, danh sách cấm 02 §7.2: KHÔNG ĐỔI. KHÔNG thêm tool mới ở 0.2.0.

## §7. Sự kiện audit MỚI (`audit_log.action`, payload KHÔNG chứa nội dung tin trừ khi ghi rõ)

| action | payload |
| :-- | :-- |
| `output.violation` | `{turn_id, surface, origin, checks: OutputCheck[], rewrite: 0\|1}` |
| `output.blocked` | `{turn_id, surface, origin, checks, must_reply: boolean}` |
| `automation.output_blocked` | `{automation_id, checks}` |
| `behavior.doc_created` / `skill.version_created` / `eval_case.added` / `eval_case.retired` | `{tenant_id, kind\|name\|suite, version\|case_id, actor}` |
| `release.created` · `release.attested` · `release.activated` · `release.rolled_back` | `{tenant_id, release_id, number, from?, attestation_id?, verdict?, reason?}` |
| `behavior.release_missing` | `{account}` — tối đa 1/giờ (như `persona.invalid` của 02) |

## §8. Bảng lỗi & hành vi caller (`domain/errors.ts`, `code` = tên lớp; bổ sung 02 §9)

| Lỗi | Khi nào | Caller BẮT BUỘC |
| :-- | :-- | :-- |
| `BehaviorSpecInvalidError` (`issues: ValidationIssue[]`) | validate voice/policy/skill/eval_case/actor; `skill_tool_unavailable` | web 400 `behavior_invalid` + `issues`; CLI exit 2; KHÔNG ghi gì |
| `SkillIndexOverBudgetError` (`surface, chars, limit`) | chỉ mục/bề mặt vượt `SKILL_INDEX_LIMITS` | web 400 `skill_index_over_budget`; người rút mô tả/bớt skill |
| `TenantMismatchError` | release tham chiếu nội dung tenant khác; trigger `release_tenant_mismatch` | web 400; là dấu hiệu bug/giả mạo ⇒ audit |
| `ImmutableContentError` (SQLSTATE `55000`) | mọi UPDATE/DELETE nội dung bị trigger chặn | LÀ BUG — web 500 + audit `behavior.immutable_violation`; KHÔNG bắt để "thử cách khác" |
| `ReleaseNotPassedError` | trigger `release_not_passed` | web 409 `release_not_passed`; CLI exit 1; KHÔNG có cờ bỏ qua |
| `NoPreviousReleaseError` | rollback khi chưa có bản trước | web 409 `no_previous_release` |
| `ReleaseMissingError` | tenant chưa có release active | runner: như `PersonaMissingError` của 02 (nhóm im, DM `MODEL_DOWN_DM_REPLY`) + audit `behavior.release_missing` + DM owner ≤ 1/giờ |
| `AttestationMismatchError` | hash/tenant trong file kết quả ≠ release | CLI exit 1, không ghi; chạy lại eval |
| `EvalEnvironmentError` | BB-20 | exit 2 trước mọi kết nối DB/model |
| `JudgeCalibrationError` | hiệu chuẩn máy chấm < 0,90 | bộ chấm `blocked`, eval exit 3; sửa ví dụ VoiceSpec hoặc `judge-calibration.jsonl` |
| `OutputPolicyViolationError` (`violations`) | cổng ra lần đầu trong lượt | `tool_result is_error` với `formatViolationsForModel`; model viết lại |
| `OutputBlockedError` (`violations`) | cổng ra lần 2 trong lượt, hoặc mọi lần gửi sau khi đã chặn | `tool_result is_error` "Đã chuyển cho người phụ trách. Kết thúc lượt, KHÔNG gửi thêm."; host xử lý SPEC-P03 §4 |
| `NotFoundError` | release/phiên bản không tồn tại | web 404 |
| `ConflictError` (giữ) | trùng version/runId sau 1 lần thử lại | web 409 |

## §9. Cấu hình (bổ sung 02 §10 — đọc trong `readCommunityConfig` hoặc script eval)

| Env | Mặc định | Dùng ở |
| :-- | :-- | :-- |
| `MODEL_JUDGE` | rỗng ⇒ theo provider như `MODEL_TRIAGE` | máy chấm (route MỚI `judge` trong `adapters/model.ts`, không tool, không retry ngoài adapter, không fallback) |
| `EVAL_MAX_MODEL_CALLS` | 800 | eval dừng `aborted` ⇒ verdict `blocked` khi vượt |
| `EVAL_BASE_MAX_AGE_DAYS` | 30 | D12 |
| `EVAL_ENV_FILE` | `.env.eval` | `release_eval.mjs` nạp cho pha chấm (DB `_eval`) |

CẤM đưa `PLATFORM_LIMITS`/`SKILL_INDEX_LIMITS` thành env (tầng 1).

## §10. Đề xuất sửa kế hoạch 02 (SO quyết — KHÔNG sửa từ kế hoạch 03)

| # | Chỗ của 02 | Đề xuất | Lợi | Chi phí nếu KHÔNG làm |
| :-- | :-- | :-- | :-- | :-- |
| E1 | 01-CONTRACTS §1 (layout), SPEC-P03 §6.3–§6.5, mọi tool gửi tin | Gom MỌI `enqueue` kind `text` của core vào `agent/community/output/send.ts` với 2 hàm `sendAgentText(…)` (0.1.0: chưa có cổng — chỉ chunk/quote/ghi `messages`) và `sendSystemText({template: TemplateId, vars})`; dời hằng câu tất định từ `prompts/system.ts` sang `prompts/templates.ts` | 0.2.0 cắm `checkOutput` ĐÚNG 1 chỗ; máy đo BB-15 viết được ngay | P03 của 03 phải lần mọi đường gửi rải rác (+0,5–1 ngày, rủi ro sót đường) |
| E2 | TESTING §3 (máy chấm `eval_community.mjs`) | Tách mỗi bộ thành module `scripts/eval/community/suites/<bộ>.mjs` export `runSuite(cases, opts) ⇒ {metrics, cases[]}`; script từ chối chạy khi `DATA_MODE=real` hoặc `TRANSPORT=zalo` | 03 tái dùng bộ `activation` làm hồi quy release; chặn sớm eval ghi outbox tới Zalo thật | 03 viết lại bộ activation hoặc gọi script con khó lấy số |
| E3 | SPEC-P08 §1 `/persona` nút "Kích hoạt" từng kind | Giữ cho 0.1.0 nhưng làm tối giản (🟢), không đầu tư UI diff | 0.2.0 thay bằng release (D04) | công phí UI bỏ đi |
| E4 | SPEC-P03 §6.6 `recordTurn(t)` | Kiểu input là `interface TurnTraceInput` (không tham số rời) | 0.2.0 thêm `releaseId`, `gateViolations`, `gateRewrites`, `skillsRead` không đổi chữ ký | đổi mọi chỗ gọi |
| E5 | 01-CONTRACTS §4 (009) | KHÔNG sửa 009 — 010 thay CHECK `outcome` và thêm cột | giữ append-only + bằng chứng probe của P01 | — |
| E6 | SPEC-P03 §7.1 cache persona 60 s | Không bắt buộc đổi ở 0.1.0 (0.2.0 thay bằng D13) | — | — |
