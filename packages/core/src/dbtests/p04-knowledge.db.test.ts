// p04-knowledge.db.test.ts — SPEC-P04 §8 hang 3: kho tri thuc + truy hoi lai tren DB that, embedding bang fetch GIA
// (`setEmbedFetchForTest`, 0 mang). Moi test dung tai lieu/token rieng; don chi dong do chinh test tao (gotcha G34).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { setEmbedFetchForTest, setEmbedRetryDelaysForTest } from '../adapters/model.js';
import { searchKnowledgeTool } from '../agent/community/tools/search-knowledge.js';
import type { ToolContext } from '../domain/types.js';
import { InvalidToolInputError } from '../domain/errors.js';
import { searchKnowledge, searchKnowledgeDetailed } from '../retrieval/search-knowledge.js';
import { embedPending, upsertDocument, type KnowledgeSectionInput } from '../services/knowledge.js';
import { vnDateString } from '../services/vn-time.js';

const DIM = 1024;
const unit = (n: number): number[] => Array.from({ length: DIM }, (_, i) => (i === n ? 1 : 0));
/** Huong rieng cho moi test (token → chi so 900..1023) de cac test khong gay nhieu top-20 vector cua nhau. */
const queryVec = (marker: string): number => {
  let h = 0;
  for (const ch of marker) h = (h * 31 + ch.charCodeAt(0)) % 124;
  return 900 + h;
};

const docIds: string[] = [];
const auditTargets: string[] = [];
const tok = (): string => `zq${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const newDocId = (): string => {
  const id = `p04doc-${randomUUID().slice(0, 8)}`;
  docIds.push(id);
  return id;
};

/** Embed gia: van ban bat dau bang `queryMarker` (truy van) hoac chua `VEC<marker>` (muc chi-vector) ⇒ cung huong voi truy van; chua token ⇒ gan huong (cosine 0.5); con lai ⇒ chi so rieng theo hash (100..899). */
function fakeEmbed(queryMarker: string, log?: { calls: number; texts: string[] }): typeof fetch {
  return async (_url, init) => {
    const reqs = (JSON.parse(String(init?.body)) as { requests: Array<{ content: { parts: Array<{ text: string }> } }> }).requests;
    if (log) {
      log.calls++;
      for (const r of reqs) log.texts.push(r.content.parts[0]!.text);
    }
    const embeddings = reqs.map((r) => {
      const t = r.content.parts[0]!.text;
      if (t.startsWith(queryMarker) || t.includes(`VEC${queryMarker}`)) return { values: unit(queryVec(queryMarker)) };
      if (t.includes(queryMarker)) {
        // chua token cua truy van nhung khong phai chinh truy van: gan huong truy van (cosine 0.5) ⇒ luon lot top 20 vector
        const v = unit(50).map((x) => x * Math.sqrt(0.75));
        v[queryVec(queryMarker)] = 0.5;
        return { values: v };
      }
      let h = 0;
      for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 800;
      return { values: unit(100 + h) };
    });
    return new Response(JSON.stringify({ embeddings }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

function mkSections(t: string, fillerHasToken = true): KnowledgeSectionInput[] {
  const filler = [
    'Cach dat lich nhac viec trong nhom Zalo',
    'Quy dinh dang bai quang cao',
    'Huong dan tao binh chon',
    'Cach moi thanh vien moi vao nhom',
    'Bao cao hang tuan cua quan tri vien',
    'Chinh sach rieng tu va du lieu',
    'Khi nao bot nen im lang',
    'Cach xin duyet thanh vien',
    'Meo viet prompt cho tro ly',
  ];
  const s: KnowledgeSectionInput[] = filler.map((h, i) => ({ sectionId: `s${i + 1}`, heading: h, body: `${h}. Noi dung so ${i + 1}${fillerHasToken ? ` ${t}` : ''}.` }));
  s.splice(2, 0, {
    sectionId: 'target',
    heading: 'Agent Zalo là gì',
    body: `Agent Zalo là gì? Agent Zalo là một trợ lý AI tự chọn công cụ để chăm sóc cộng đồng trên Zalo, khác chatbot kịch bản. ${t}`,
  });
  return s; // 10 muc
}

async function mkDoc(over: Partial<Parameters<typeof upsertDocument>[0]> & { t: string }): Promise<string> {
  const id = over.id ?? newDocId();
  if (!docIds.includes(id)) docIds.push(id);
  await upsertDocument({
    id,
    title: over.title ?? `Tai lieu ${id}`,
    version: '1',
    status: over.status ?? 'approved',
    effectiveFrom: over.effectiveFrom ?? '2020-01-01',
    effectiveTo: over.effectiveTo ?? null,
    source: 'p04-test',
    tags: ['p04'],
    sections: over.sections ?? mkSections(over.t),
  });
  return id;
}

const sectionRow = async (doc: string, sec: string) =>
  (
    await sql<{ embedding: string | null; embedded_at: string | null; embedding_model: string | null; body: string }>(
      `select embedding::text as embedding, embedded_at::text as embedded_at, embedding_model, body from kb_sections where document_id = $1 and section_id = $2`,
      [doc, sec]
    )
  )[0];

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-embed-key';
  setEmbedRetryDelaysForTest([1, 1]);
});
afterEach(() => {
  setEmbedFetchForTest(null);
  delete process.env.EMBED_PROVIDER;
});
afterAll(async () => {
  setEmbedRetryDelaysForTest(null);
  delete process.env.GEMINI_API_KEY;
  await sql(`delete from kb_sections where document_id = any($1::text[])`, [docIds]);
  await sql(`delete from kb_documents where id = any($1::text[])`, [docIds]);
  if (auditTargets.length > 0) await sql(`delete from audit_log where action = 'kb.search' and target = any($1::text[])`, [auditTargets]);
  await closeDb();
});

describe('upsertDocument (SPEC-P04 §1)', () => {
  it('chen 10 muc; doi body ⇒ embedding=null; muc giu nguyen giu vector; muc bi bo ⇒ xoa; trung sectionId / body > 4000 ⇒ InvalidToolInputError, khong ghi', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    expect((await sql(`select 1 from kb_sections where document_id = $1`, [id])).length).toBe(10);

    setEmbedFetchForTest(fakeEmbed(t));
    expect(await embedPending(50, new Date(), [id])).toBe(10);
    const before = await sectionRow(id, 'target');
    expect(before!.embedding).not.toBeNull();

    const sections = mkSections(t).filter((s) => s.sectionId !== 's9');
    sections.find((s) => s.sectionId === 'target')!.body += ' (da sua)';
    const res = await upsertDocument({ id, title: 'Doi tieu de', version: '2', status: 'approved', effectiveFrom: '2020-01-01', sections });
    expect(res).toEqual({ inserted: 0, changed: 1, unchanged: 8, removed: 1 });

    const after = await sectionRow(id, 'target');
    expect(after).toMatchObject({ embedding: null, embedded_at: null, embedding_model: null });
    const kept = await sectionRow(id, 's1');
    expect(kept!.embedding).not.toBeNull(); // khong doi ⇒ giu vector
    expect(await sectionRow(id, 's9')).toBeUndefined();
    const doc = await sql<{ title: string; version: string }>(`select title, version from kb_documents where id = $1`, [id]);
    expect(doc[0]).toEqual({ title: 'Doi tieu de', version: '2' });

    await expect(
      upsertDocument({ id, title: 'x', version: '3', status: 'approved', effectiveFrom: '2020-01-01', sections: [{ sectionId: 'a', heading: null, body: 'y'.repeat(4001) }] })
    ).rejects.toBeInstanceOf(InvalidToolInputError);
    await expect(
      upsertDocument({ id, title: 'x', version: '3', status: 'approved', effectiveFrom: '2020-01-01', sections: [{ sectionId: 'a', heading: null, body: 'y' }, { sectionId: 'a', heading: null, body: 'z' }] })
    ).rejects.toBeInstanceOf(InvalidToolInputError);
    expect((await sql(`select 1 from kb_sections where document_id = $1`, [id])).length).toBe(9); // khong bi xoa trong lan loi
    expect((await sql<{ version: string }>(`select version from kb_documents where id = $1`, [id]))[0]!.version).toBe('2');
  });
});

describe('searchKnowledge — lexical (useVector:false)', () => {
  it("seed 10 muc: 'agent Zalo là gì' ⇒ hit dau la muc mong doi; 10 muc cung token deu khop, lexicalRank 1-based, vectorRank null", async () => {
    const t = tok();
    const id = await mkDoc({ t });
    const hits = await searchKnowledge(`${t} agent Zalo là gì`, { useVector: false, topK: 20 });
    expect(hits[0]).toMatchObject({ documentId: id, sectionId: 'target', lexicalRank: 1, vectorRank: null });
    expect(hits[0]!.title).toBe(`Tai lieu ${id}`);
    const mine = hits.filter((h) => h.documentId === id);
    expect(mine).toHaveLength(10);
    expect(hits.every((h) => h.vectorRank === null)).toBe(true);
    expect(hits[0]!.score).toBeCloseTo(1 / 61, 12);
  });

  it('chuoi rong / toan ky tu la ⇒ [] khong cham DB; query chua dau nhay ⇒ khong loi cu phap', async () => {
    expect(await searchKnowledge('   ')).toEqual([]);
    expect(await searchKnowledge("a'b ŉ ☃ ; |", { useVector: false })).toBeInstanceOf(Array);
  });

  it('draft / deprecated / het han / chua hieu luc ⇒ 0 hit; approved con han ⇒ co hit', async () => {
    const t = tok();
    const now = new Date();
    const day = (offset: number): string => vnDateString(new Date(now.getTime() + offset * 86_400_000));
    const sec: KnowledgeSectionInput[] = [{ sectionId: 'a', heading: 'Muc', body: `noi dung ${t}` }];
    const ok = await mkDoc({ t, sections: sec, effectiveFrom: day(-5), effectiveTo: day(5) });
    const edge = await mkDoc({ t, sections: sec, effectiveFrom: day(0), effectiveTo: day(0) }); // hom nay VN: con hieu luc ca 2 dau
    await mkDoc({ t, sections: sec, status: 'draft' });
    await mkDoc({ t, sections: sec, status: 'deprecated' });
    await mkDoc({ t, sections: sec, effectiveFrom: day(-10), effectiveTo: day(-1) }); // het han hom qua
    await mkDoc({ t, sections: sec, effectiveFrom: day(1) }); // mai moi co hieu luc
    const hits = await searchKnowledge(t, { useVector: false, topK: 20, now });
    expect(hits.map((h) => h.documentId).sort()).toEqual([ok, edge].sort());
  });
});

describe('embedPending (SPEC-P04 §1)', () => {
  it('nhung muc chua nhung cua tai lieu approved: set embedding + embedded_at + embedding_model; draft KHONG nhung; lan 2 ⇒ 0', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    const draft = await mkDoc({ t, status: 'draft' });
    const log = { calls: 0, texts: [] as string[] };
    setEmbedFetchForTest(fakeEmbed(t, log));
    const now = new Date();
    expect(await embedPending(50, now, [id, draft])).toBe(10);
    const row = await sectionRow(id, 'target');
    expect(row!.embedding).not.toBeNull();
    expect(row!.embedded_at).not.toBeNull();
    expect(row!.embedding_model).toBe('gemini-embedding-001');
    expect((await sectionRow(draft, 'target'))!.embedding).toBeNull();
    expect(log.texts).toHaveLength(10); // chi body cua 10 muc approved
    expect(await embedPending(50, now, [id, draft])).toBe(0);
    expect(log.calls).toBe(1);
  });

  it('limit ⇒ chi nhung toi da `limit` muc', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    setEmbedFetchForTest(fakeEmbed(t));
    expect(await embedPending(4, new Date(), [id])).toBe(4);
    expect((await sql(`select 1 from kb_sections where document_id = $1 and embedding is null`, [id])).length).toBe(6);
  });

  it('EMBED_PROVIDER=none ⇒ 0, 0 fetch, khong cham muc nao', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    const log = { calls: 0, texts: [] as string[] };
    setEmbedFetchForTest(fakeEmbed(t, log));
    process.env.EMBED_PROVIDER = 'none';
    expect(await embedPending(50, new Date(), [id])).toBe(0);
    expect(log.calls).toBe(0);
  });

  it('EmbeddingUnavailableError (503 sau retry) ⇒ tra 0, KHONG nem, audit kb.embed_unavailable toi da 1 lan/gio', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    setEmbedFetchForTest(async () => new Response('x', { status: 503 }));
    const countAudit = async (): Promise<number> => (await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = 'kb.embed_unavailable'`))[0]!.c;
    const before = await countAudit();
    const now = new Date();
    expect(await embedPending(50, now, [id])).toBe(0);
    expect(await embedPending(50, now, [id])).toBe(0);
    const added = (await countAudit()) - before;
    expect(added).toBeLessThanOrEqual(1);
    expect((await sectionRow(id, 'target'))!.embedding).toBeNull(); // van cho nhung
    // loi KHONG lam hong lan sau: provider tot lai ⇒ nhung duoc
    setEmbedFetchForTest(fakeEmbed(t));
    expect(await embedPending(50, now, [id])).toBe(10);
  });

  it('body doi giua luc doc va luc ghi ⇒ KHONG de vector cu len noi dung moi', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    setEmbedFetchForTest(async (_u, init) => {
      // trong luc "goi embedding", nguoi dung sua muc target
      await sql(`update kb_sections set body = body || ' DA-SUA' where document_id = $1 and section_id = 'target'`, [id]);
      const n = (JSON.parse(String(init?.body)) as { requests: unknown[] }).requests.length;
      return new Response(JSON.stringify({ embeddings: Array.from({ length: n }, () => ({ values: unit(1) })) }), { status: 200 });
    });
    expect(await embedPending(50, new Date(), [id])).toBe(9);
    expect((await sectionRow(id, 'target'))!.embedding).toBeNull();
  });
});

describe('searchKnowledge — lai (lexical + vector + RRF)', () => {
  it('muc CHI-VECTOR (khong khop tu khoa nao) lot top K, vectorRank khong null; muc khop tu khoa co ca hai hang', async () => {
    const t = tok();
    const sections = mkSections(t, false);
    sections.push({ sectionId: 'vecOnly', heading: 'Chu de khac hoan toan', body: `VEC${t} mot doan van khong chua bat ky tu nao cua truy van tu khoa.` });
    const id = await mkDoc({ t, sections });
    setEmbedFetchForTest(fakeEmbed(t));
    expect(await embedPending(50, new Date(), [id])).toBe(11);

    const query = t; // chi 'target' khop tu khoa (cac muc con lai khong chua token)
    const noVec = await searchKnowledge(query, { useVector: false, topK: 5 });
    expect(noVec.some((h) => h.sectionId === 'vecOnly')).toBe(false);

    const { hits, vectorUsed } = await searchKnowledgeDetailed(query, { topK: 5 });
    expect(vectorUsed).toBe(true);
    const v = hits.find((h) => h.documentId === id && h.sectionId === 'vecOnly');
    expect(v).toBeDefined();
    expect(v!.vectorRank).not.toBeNull();
    expect(v!.lexicalRank).toBeNull();
    expect(hits.length).toBeLessThanOrEqual(5);
    // muc target khop manh nhat tu khoa (lexicalRank 1) va co mat o ca hai danh sach
    expect(hits[0]).toMatchObject({ documentId: id, sectionId: 'target', lexicalRank: 1 });
    expect(hits[0]!.vectorRank).not.toBeNull();
    expect(hits[1]).toMatchObject({ documentId: id, sectionId: 'vecOnly', lexicalRank: null, vectorRank: 1 }); // 1/61 > cac muc don danh sach hang >= 2
    // diem RRF = tong hai thanh phan (muc chi-vector hang 1 ⇒ 1/61)
    expect(v!.score).toBeCloseTo(1 / (60 + v!.vectorRank!), 12);
  });

  it('muc approved nhung chua co embedding KHONG vao danh sach vector; draft co embedding cung khong', async () => {
    const t = tok();
    const id = await mkDoc({ t, sections: [{ sectionId: 'a', heading: 'A', body: `VEC${t}` }] });
    const draft = await mkDoc({ t, status: 'draft', sections: [{ sectionId: 'a', heading: 'A', body: `VEC${t}` }] });
    setEmbedFetchForTest(fakeEmbed(t));
    await embedPending(50, new Date(), [id]);
    // ep vector cho ban draft de chung minh bo loc status khi truy hoi
    await sql(`update kb_sections set embedding = (select embedding from kb_sections where document_id = $1 and section_id = 'a') where document_id = $2`, [id, draft]);
    const { hits } = await searchKnowledgeDetailed(`${t}`, { topK: 20 });
    const ids = hits.map((h) => h.documentId);
    expect(ids).toContain(id);
    expect(ids).not.toContain(draft); // ban draft co vector y het nhung bi loc status
  });

  it('embedding loi (503) hoac het han chot ⇒ lexical thuan, vectorRank null, KHONG nem', async () => {
    const t = tok();
    const id = await mkDoc({ t });
    setEmbedFetchForTest(async () => new Response('x', { status: 503 }));
    const a = await searchKnowledgeDetailed(`${t} agent Zalo là gì`, { topK: 3 });
    expect(a.vectorUsed).toBe(false);
    expect(a.hits[0]).toMatchObject({ documentId: id, sectionId: 'target', vectorRank: null });

    const log = { calls: 0, texts: [] as string[] };
    setEmbedFetchForTest(fakeEmbed(t, log));
    const b = await searchKnowledgeDetailed(`${t} agent Zalo là gì`, { topK: 3, deadlineAt: Date.now() - 1 });
    expect(b.vectorUsed).toBe(false);
    expect(log.calls).toBe(0);
    expect(b.hits[0]!.sectionId).toBe('target');
  });

  it('EMBED_PROVIDER=none ⇒ khong goi embed; useVector:false ⇒ khong goi embed', async () => {
    const t = tok();
    await mkDoc({ t });
    const log = { calls: 0, texts: [] as string[] };
    setEmbedFetchForTest(fakeEmbed(t, log));
    process.env.EMBED_PROVIDER = 'none';
    await searchKnowledge(t);
    delete process.env.EMBED_PROVIDER;
    await searchKnowledge(t, { useVector: false });
    expect(log.calls).toBe(0);
  });
});

describe('tool search_knowledge (SPEC-P04 §3)', () => {
  it('rut body con <= 600 ky tu quanh token khop, audit kb.search {hits, vector}, tra title + note trich dan', async () => {
    const t = tok();
    const long = `${'mo dau '.repeat(200)}${t} noi dung can tim ${'duoi '.repeat(200)}`.slice(0, 4000);
    const id = await mkDoc({ t, sections: [{ sectionId: 'long', heading: 'Muc dai', body: long }] });
    setEmbedFetchForTest(fakeEmbed(t));
    await embedPending(50, new Date(), [id]);
    const threadId = `p04-tool-${randomUUID().slice(0, 8)}`;
    auditTargets.push(threadId);
    const ctx = { requester: null, threadId, deadlineAt: Date.now() + 5000 } as unknown as ToolContext;
    const out = (await searchKnowledgeTool.run(ctx, { query: t })) as { hits: Array<{ title: string; heading: string; quote: string }>; note: string };
    const mine = out.hits.filter((h) => h.heading === 'Muc dai');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toBe(`Tai lieu ${id}`);
    expect(mine[0]!.quote.length).toBeLessThanOrEqual(602);
    expect(mine[0]!.quote).toContain(t);
    expect(out.note).toContain('theo');
    const a = await sql<{ data: { hits: number; vector: boolean } }>(`select data from audit_log where action = 'kb.search' and target = $1`, [threadId]);
    expect(a).toHaveLength(1);
    expect(a[0]!.data.vector).toBe(true);
    expect(a[0]!.data.hits).toBe(out.hits.length);

    // khong co vector (provider none) ⇒ audit vector:false
    process.env.EMBED_PROVIDER = 'none';
    await searchKnowledgeTool.run(ctx, { query: t });
    const b = await sql<{ data: { vector: boolean } }>(`select data from audit_log where action = 'kb.search' and target = $1 order by id desc limit 1`, [threadId]);
    expect(b[0]!.data.vector).toBe(false);
  });
});
