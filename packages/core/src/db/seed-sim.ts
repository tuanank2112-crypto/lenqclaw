// packages/core/src/db/seed-sim.ts — du lieu MO PHONG (SPEC-P01 §4.2): CHI chay
// khi `DATA_MODE=sim`, idempotent (chay 2 lan => so dong khong doi). Chay SAU
// `npm run db:seed` (can tai khoan `community`). Embedding de NULL (P04 nhung).

import { pathToFileURL } from 'node:url';
import { sql, tx, closeDb } from '../adapters/db.js';

const ACCOUNT = 'community';
const KB_DOC_ID = 'kb-cong-dong';

interface GroupSeed {
  threadId: string;
  name: string;
  enabled: boolean;
  mode: 'mention' | 'ambient';
  joinPolicy: 'manual' | 'auto_approve' | 'agent_review';
  budgetPerHour: number;
}

const GROUPS: GroupSeed[] = [
  { threadId: 'sim-group-1', name: 'Cộng đồng AI Agent (mô phỏng 1)', enabled: true, mode: 'mention', joinPolicy: 'agent_review', budgetPerHour: 20 },
  { threadId: 'sim-group-2', name: 'Cộng đồng AI Agent (mô phỏng 2)', enabled: true, mode: 'ambient', joinPolicy: 'manual', budgetPerHour: 20 },
  { threadId: 'sim-group-off', name: 'Nhóm đang tắt (mô phỏng)', enabled: false, mode: 'mention', joinPolicy: 'manual', budgetPerHour: 20 },
];

interface MemberSeed {
  uid: string;
  name: string;
  role: 'moderator' | 'member';
}

const MEMBERS: MemberSeed[] = [
  { uid: 'sim-mod-1', name: 'Phạm Thu Hà', role: 'moderator' },
  { uid: 'sim-mem-1', name: 'Nguyễn Văn An', role: 'member' },
  { uid: 'sim-mem-2', name: 'Trần Thị Bích', role: 'member' },
  { uid: 'sim-mem-3', name: 'Lê Hoàng Cường', role: 'member' },
  { uid: 'sim-mem-4', name: 'Đặng Minh Đức', role: 'member' },
  { uid: 'sim-mem-5', name: 'Võ Ngọc Em', role: 'member' },
];

// Muc tri thuc: moi muc `[CHỦ ĐỀ: ...]` + 2-4 cau.
const KB_SECTIONS: Array<{ sectionId: string; heading: string; body: string }> = [
  {
    sectionId: 'sec01',
    heading: 'AI agent là gì',
    body: '[CHỦ ĐỀ: AI agent] AI agent là phần mềm dùng mô hình ngôn ngữ để tự quyết định gọi công cụ nhằm hoàn thành việc. Khác chatbot trả lời cố định, agent có thể tra cứu, ghi dữ liệu và hành động. Mọi hành động nguy hiểm nên đi qua bước duyệt của con người.',
  },
  {
    sectionId: 'sec02',
    heading: 'Agent khác chatbot kịch bản',
    body: '[CHỦ ĐỀ: AI agent] Chatbot kịch bản chạy theo cây lựa chọn cố định nên dễ vỡ khi khách hỏi ngoài kịch bản. Agent hiểu ý câu hỏi và chọn công cụ phù hợp. Đổi lại agent cần giới hạn quyền và theo dõi chất lượng trả lời.',
  },
  {
    sectionId: 'sec03',
    heading: 'Dùng AI cho chăm sóc khách hàng trên Zalo',
    body: '[CHỦ ĐỀ: CSKH] Zalo là kênh liên lạc chính của nhiều doanh nghiệp nhỏ tại Việt Nam. AI có thể trả lời câu hỏi thường gặp, báo giá cơ bản và chuyển cuộc trò chuyện khó cho người thật. Nên bắt đầu từ 5 đến 10 câu hỏi khách hỏi nhiều nhất.',
  },
  {
    sectionId: 'sec04',
    heading: 'Kho tri thức cho AI CSKH',
    body: '[CHỦ ĐỀ: CSKH] Chất lượng câu trả lời phụ thuộc vào tài liệu nguồn. Mỗi mục nên có một chủ đề rõ ràng và câu chữ ngắn. Tài liệu cũ hoặc mâu thuẫn là nguyên nhân phổ biến của trả lời sai.',
  },
  {
    sectionId: 'sec05',
    heading: 'Khi nào chuyển cho người thật',
    body: '[CHỦ ĐỀ: CSKH] Chuyển cho người thật khi khách phàn nàn gay gắt, hỏi về thanh toán hoặc hợp đồng, hoặc khi AI không chắc câu trả lời. Ghi lại lý do chuyển để cải thiện tài liệu. Đừng để khách chờ không có phản hồi.',
  },
  {
    sectionId: 'sec06',
    heading: 'Quản trị nhóm Zalo bằng AI',
    body: '[CHỦ ĐỀ: Zalo] AI làm phó nhóm có thể chào thành viên mới, trả lời câu hỏi và nhắc lịch. Xoá tin spam và cảnh cáo thành viên cần quyền quản trị. Kick hoặc chặn người nên luôn có bước duyệt của chủ nhóm.',
  },
  {
    sectionId: 'sec07',
    heading: 'Rủi ro khi tự động hoá tài khoản Zalo cá nhân',
    body: '[CHỦ ĐỀ: Zalo] Tài khoản Zalo cá nhân có thể bị khoá nếu gửi tin dồn dập hoặc lặp lại. Nên giới hạn số tin mỗi giờ, giãn cách giữa các tin và tránh nhắn riêng cho người lạ. Luôn có phương án dự phòng khi tài khoản bị khoá.',
  },
  {
    sectionId: 'sec08',
    heading: 'Viết persona cho agent',
    body: '[CHỦ ĐỀ: AI agent] Persona mô tả giọng điệu, điều được nói, điều không được nói và khi nào nên im lặng. Viết ngắn, cụ thể, có ví dụ. Thay đổi persona nên có phiên bản để quay lại khi kết quả xấu đi.',
  },
  {
    sectionId: 'sec09',
    heading: 'Đo chất lượng agent',
    body: '[CHỦ ĐỀ: AI agent] Dùng bộ câu hỏi mẫu có đáp án mong đợi để chấm lại sau mỗi lần đổi persona hoặc tài liệu. Theo dõi tỉ lệ trả lời đúng, tỉ lệ im lặng và tỉ lệ chuyển người. Số liệu thật từ nhóm chạy thử đáng tin hơn cảm giác.',
  },
  {
    sectionId: 'sec10',
    heading: 'Bắt đầu dựng AI CSKH cho doanh nghiệp',
    body: '[CHỦ ĐỀ: CSKH] Chọn một kênh, một nhóm câu hỏi và chạy thử trong phạm vi nhỏ. Xem nhật ký mỗi ngày trong tuần đầu rồi mới mở rộng. Ai cần hỗ trợ dựng có thể nhắn riêng cho chủ nhóm.',
  },
];

export interface RunSeedSimResult {
  groups: number;
  members: number;
  kbSections: number;
}

export async function runSeedSim(): Promise<RunSeedSimResult> {
  if (process.env.DATA_MODE !== 'sim') {
    throw new Error('db:seed:sim CHI chay khi DATA_MODE=sim (SPEC-P01 §4.2).');
  }

  const account = await sql<{ id: string }>(`select id from zalo_accounts where id = $1`, [ACCOUNT]);
  if (account.length === 0) {
    throw new Error('seed-sim: khong tim thay tai khoan community — chay "npm run db:seed" truoc.');
  }

  await tx(async (q) => {
    await q(
      `insert into account_owners (zalo_account_id, zalo_uid, label) values ($1,'sim-owner','Chủ mô phỏng')
       on conflict (zalo_account_id, zalo_uid) do nothing`,
      [ACCOUNT]
    );

    for (const g of GROUPS) {
      await q(
        `insert into zalo_groups (zalo_account_id, thread_id, name, enabled, mode, join_policy, budget_per_hour)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (zalo_account_id, thread_id) do nothing`,
        [ACCOUNT, g.threadId, g.name, g.enabled, g.mode, g.joinPolicy, g.budgetPerHour]
      );
    }

    const memberRows: Array<{ thread: string; m: MemberSeed }> = [];
    for (const thread of ['sim-group-1', 'sim-group-2']) {
      for (const m of MEMBERS) memberRows.push({ thread, m });
    }
    memberRows.push({ thread: 'sim-group-off', m: MEMBERS.find((m) => m.uid === 'sim-mem-1')! });
    for (const { thread, m } of memberRows) {
      await q(
        `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name)
         values ($1,$2,$3,$4,$5) on conflict (zalo_account_id, thread_id, zalo_uid) do nothing`,
        [ACCOUNT, thread, m.uid, m.role, m.name]
      );
    }

    await q(
      `insert into kb_documents (id, title, version, status, effective_from, source)
       values ($1,'Kiến thức cộng đồng AI agent','1','approved', current_date, 'seed')
       on conflict (id) do nothing`,
      [KB_DOC_ID]
    );
    for (const s of KB_SECTIONS) {
      await q(
        `insert into kb_sections (document_id, section_id, heading, body) values ($1,$2,$3,$4)
         on conflict (document_id, section_id) do nothing`,
        [KB_DOC_ID, s.sectionId, s.heading, s.body]
      );
    }
  });

  const [{ c: groups }] = await sql<{ c: number }>(
    `select count(*)::int as c from zalo_groups where zalo_account_id = $1 and thread_id like 'sim-group-%'`,
    [ACCOUNT]
  );
  const [{ c: members }] = await sql<{ c: number }>(
    `select count(*)::int as c from group_members where zalo_account_id = $1 and thread_id like 'sim-group-%'`,
    [ACCOUNT]
  );
  const [{ c: kbSections }] = await sql<{ c: number }>(
    `select count(*)::int as c from kb_sections where document_id = $1`,
    [KB_DOC_ID]
  );
  return { groups, members, kbSections };
}

async function main(): Promise<void> {
  try {
    const result = await runSeedSim();
    console.log(`seed-sim: groups=${result.groups} members=${result.members} kb_sections=${result.kbSections}`);
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`SEED_SIM_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  void main();
}
