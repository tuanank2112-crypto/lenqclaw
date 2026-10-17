// moderation-grid.test.ts — SPEC-P05 §10 hang 2: >= 20 ca hit (moi loai >= 3; scam_phrase sinh tu mang SCAM_PHRASES, dat GIUA cau co dau)
// + 40 cau cong dong AI binh thuong ⇒ 0 hit (false-positive = 0).
import { describe, expect, it } from 'vitest';
import { classifyGrid, SCAM_PHRASES, type GridContext, type GridHit } from './moderation-grid.js';

const base: GridContext = { mentions: [], senderRole: 'member', senderBufferCount: 10, identicalRecentCount: 1 };
const ctx = (over: Partial<GridContext> = {}): GridContext => ({ ...base, ...over });
const mentions = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, pos: i, len: 3 }));

describe('classifyGrid — hit', () => {
  it('SCAM_PHRASES >= 20 cum, moi cum >= 3 tu', () => {
    expect(SCAM_PHRASES.length).toBeGreaterThanOrEqual(20);
    for (const p of SCAM_PHRASES) expect(p.split(' ').length).toBeGreaterThanOrEqual(3);
  });
  for (const phrase of SCAM_PHRASES) {
    it(`scam_phrase: "${phrase}" giua cau co dau ⇒ hit + hard`, () => {
      const r = classifyGrid(`Chào cả nhà, mình thấy tin này: ${phrase} nhé mọi người ơi!`, ctx());
      expect(r.hits).toContain('scam_phrase');
      expect(r.hard).toBe(true);
    });
  }
  it('scam_phrase khop khi viet HOA / co dau / chen dau cau', () => {
    expect(classifyGrid('VIỆC NHẸ, LƯƠNG CAO!!! Liên hệ ngay', ctx()).hits).toContain('scam_phrase');
    expect(classifyGrid('Chuyển khoản trước để nhận quà', ctx()).hits).toContain('scam_phrase');
  });

  it('mass_mention: >= 8 mention (3 ca: 8, 9, 20); 7 thi khong', () => {
    for (const n of [8, 9, 20]) expect(classifyGrid('a b c', ctx({ mentions: mentions(n) })).hits).toEqual(['mass_mention']);
    expect(classifyGrid('a b c', ctx({ mentions: mentions(7) })).hits).toEqual([]);
    expect(classifyGrid('a b c', ctx({ mentions: mentions(8) })).hard).toBe(false);
  });
  it('repeat_burst: >= 5 tin giong het (3 ca: 5, 6, 12) ⇒ hard; 4 thi khong', () => {
    for (const n of [5, 6, 12]) {
      const r = classifyGrid('mua ngay giá sốc', ctx({ identicalRecentCount: n }));
      expect(r.hits).toEqual(['repeat_burst']);
      expect(r.hard).toBe(true);
    }
    expect(classifyGrid('mua ngay giá sốc', ctx({ identicalRecentCount: 4 })).hits).toEqual([]);
  });
  it('link_flood: >= 3 URL (3 ca); 2 URL thi khong; khong hard', () => {
    expect(classifyGrid('xem http://a.com http://b.com http://c.com', ctx()).hits).toEqual(['link_flood']);
    expect(classifyGrid('https://x.vn/1 https://x.vn/2 https://x.vn/3 https://x.vn/4', ctx()).hits).toEqual(['link_flood']);
    expect(classifyGrid('www.a.com www.b.com www.c.com', ctx()).hits).toEqual(['link_flood']);
    const two = classifyGrid('xem https://docs.example.com/a và https://github.com/b', ctx());
    expect(two.hits).toEqual([]);
    expect(classifyGrid('http://a.com http://b.com http://c.com', ctx()).hard).toBe(false);
  });
  it('contact_spam: >= 2 SDT + lh/lien he/zalo, nguoi gui < 3 tin (3 ca); nguoi gui lau nam thi khong', () => {
    expect(classifyGrid('LH 0912345678 hoặc 0987654321 nhé', ctx({ senderBufferCount: 1 })).hits).toEqual(['contact_spam']);
    expect(classifyGrid('Liên hệ 0912.345.678 / 0987 654 321 để biết thêm', ctx({ senderBufferCount: 2 })).hits).toEqual(['contact_spam']);
    expect(classifyGrid('nhắn zalo 0912345678 hay +84987654321 đi', ctx({ senderBufferCount: 1 })).hits).toEqual(['contact_spam']);
    expect(classifyGrid('LH 0912345678 hoặc 0987654321 nhé', ctx({ senderBufferCount: 3 })).hits).toEqual([]);
    expect(classifyGrid('LH 0912345678 nhé', ctx({ senderBufferCount: 1 })).hits).toEqual([]);
    expect(classifyGrid('số 0912345678 và 0987654321 thôi', ctx({ senderBufferCount: 1 })).hits).toEqual([]);
  });
  it('invite_link: zalo.me/g/ hoac t.me/ tu nguoi thuong (3 ca); owner/moderator thi khong', () => {
    expect(classifyGrid('vào nhóm https://zalo.me/g/abcxyz', ctx()).hits).toEqual(['invite_link']);
    expect(classifyGrid('join t.me/spamchannel', ctx({ senderRole: 'stranger' })).hits).toEqual(['invite_link']);
    expect(classifyGrid('Zalo.me/g/aaa111 nè', ctx()).hits).toEqual(['invite_link']);
    expect(classifyGrid('vào nhóm https://zalo.me/g/abcxyz', ctx({ senderRole: 'moderator' })).hits).toEqual([]);
    expect(classifyGrid('t.me/channel', ctx({ senderRole: 'owner' })).hits).toEqual([]);
    // khong bat nham mien chi chua "t.me" o cuoi tu khac
    expect(classifyGrid('xem great.me/profile', ctx()).hits).toEqual([]);
  });
  it('nhieu hit cung luc: thu tu co dinh', () => {
    const r = classifyGrid('viec nhe luong cao http://a.com http://b.com http://c.com t.me/x', ctx({ mentions: mentions(8) }));
    expect(r.hits).toEqual(['mass_mention', 'link_flood', 'scam_phrase', 'invite_link']);
    expect(r.hard).toBe(true);
  });
});

const CLEAN: string[] = [
  'Mình đang thử viết prompt cho agent chăm sóc khách hàng, mọi người có mẫu nào hay không?',
  'Jailbreak kiểu này bị chặn ở lớp system prompt hay lớp guardrail vậy anh?',
  'Token của Gemini flash tính giá bao nhiêu mỗi triệu vậy mọi người?',
  'Mua gói Pro của Claude có đáng không, giá bao nhiêu một tháng nhỉ?',
  'Ai biết cách giới hạn số token đầu ra khi gọi API không?',
  'Em mới học LangGraph, có node nào dùng để rẽ nhánh theo điều kiện không ạ?',
  'Cho mình hỏi RAG khác fine-tune ở chỗ nào, nên dùng cái nào trước?',
  'Mình đã thử embedding 1024 chiều, truy hồi lai với tsvector chạy khá ổn.',
  'Hôm nay có buổi chia sẻ về agent lúc 8h tối, ai rảnh vào nghe nhé.',
  'Gói miễn phí của Gemini giới hạn bao nhiêu request mỗi ngày vậy?',
  'Prompt injection thì phòng thủ bằng cách tách dữ liệu và chỉ dẫn, đúng không?',
  'Cảm ơn anh, mình làm theo hướng dẫn rồi và chạy được rồi.',
  'Link tài liệu chính thức nằm ở https://docs.example.com/agents anh nhé.',
  'Mình gửi hai đường dẫn tham khảo: https://github.com/a/b và https://arxiv.org/abs/1234.',
  'Ai đã dùng MCP server để nối với CRM chưa, kể mình nghe với.',
  'Cho mình xin file mẫu tool schema JSON để tham khảo được không?',
  'Model nào rẻ mà vẫn gọi tool ổn định vậy mọi người, mình đang cần chạy nhiều.',
  'Hôm qua mình bị lỗi 429 liên tục, đổi sang model khác thì hết.',
  'Có ai biết cách nhờ agent đặt lịch nhắc việc trong nhóm Zalo không?',
  'Em đăng ký khóa học agent hôm qua, thấy nội dung khá chi tiết.',
  'Nhóm mình có quy định đăng quảng cáo thế nào ạ, em muốn chia sẻ sản phẩm nhỏ.',
  'Mình thấy cách chia nhỏ tác vụ cho nhiều agent giúp giảm lỗi rõ rệt.',
  'Giá API chênh nhau khá nhiều, mọi người so sánh giúp mình với.',
  'Anh ơi bao nhiêu token thì vượt giới hạn ngữ cảnh của model này vậy?',
  'Cần tư vấn chọn gói VPS để chạy worker agent, ngân sách khoảng vài trăm nghìn.',
  'Mua thêm quota hay chuyển sang provider khác thì lợi hơn nhỉ?',
  'Số điện thoại hỗ trợ của nhà cung cấp là 0912345678, bạn gọi thử xem.',
  'Mọi người cho mình xin review khóa học prompt engineering với.',
  'Mình đang làm bot trả lời tự động, cần hướng dẫn xử lý khi model im lặng.',
  'Đoạn code này lỗi ở dòng 42, thiếu await trước khi gọi fetch.',
  'Hôm nay mình học được cách dùng structured output, rất tiện cho việc phân loại.',
  'Ai cần nhận tài liệu thì để lại email, mình gửi bản tóm tắt buổi họp.',
  'Có cần xác minh tài khoản khi đăng ký API không nhỉ, mình chưa thấy yêu cầu.',
  'Chương trình giảm giá khóa học đến hết tuần này, bạn nào quan tâm thì hỏi admin.',
  'Anh admin ơi cho em hỏi quy định kick thành viên spam trong nhóm là gì ạ?',
  'Mình vừa thử nghiệm giới hạn tốc độ gửi tin, Zalo khá nghiêm ngặt.',
  'Đầu tư vào hạ tầng đo đạc sớm sẽ đỡ đau đầu khi agent chạy thật.',
  'Kiếm được ví dụ hay về agent lập lịch thì chia sẻ cho cả nhóm nhé.',
  'Làm việc với agent nhiều tool thì nên giữ danh sách tool ngắn thôi.',
  'Nhờ mọi người góp ý bản demo agent hỗ trợ cộng đồng của mình nhé.',
];

describe('classifyGrid — cau cong dong AI binh thuong ⇒ 0 hit', () => {
  it('co dung 40 cau', () => expect(CLEAN).toHaveLength(40));
  for (const [i, s] of CLEAN.entries()) {
    it(`#${i + 1} khong hit: ${s.slice(0, 50)}`, () => {
      const r = classifyGrid(s, ctx({ senderBufferCount: 6, identicalRecentCount: 1, mentions: [] }));
      expect(r.hits).toEqual([] as GridHit[]);
      expect(r.hard).toBe(false);
    });
  }
  it('nguoi moi (< 3 tin) gui 1 so dien thoai + zalo + 1 link: khong hit', () => {
    expect(classifyGrid('Mình mới vào, mọi người liên hệ zalo 0912345678 nếu cần hợp tác nhé https://example.com', ctx({ senderBufferCount: 1 })).hits).toEqual([]);
  });
});
