import { describe, expect, it } from 'vitest';
import { canAccess } from './policy';

describe('canAccess (SPEC-P01 §3.1)', () => {
  it('/login va /api/auth/* mo cho moi vai, ke ca chua dang nhap', () => {
    for (const role of [null, 'admin', 'operator'] as const) {
      expect(canAccess(role, '/login')).toBe(true);
      expect(canAccess(role, '/api/auth/login')).toBe(true);
    }
  });

  it('/api/healthz (D37): GET/HEAD mo cho moi vai ke ca chua dang nhap; POST va duong con bi chan khi chua dang nhap', () => {
    for (const role of [null, 'admin', 'operator'] as const) {
      expect(canAccess(role, '/api/healthz', 'GET')).toBe(true);
      expect(canAccess(role, '/api/healthz', 'HEAD')).toBe(true);
    }
    expect(canAccess(null, '/api/healthz', 'POST')).toBe(false);
    expect(canAccess(null, '/api/healthz/x', 'GET')).toBe(false);
    expect(canAccess(null, '/api/healthzz', 'GET')).toBe(false);
  });

  it('chua dang nhap: chi /login va /api/auth/* duoc phep', () => {
    for (const p of ['/', '/groups', '/api/groups/1', '/approvals', '/zalo', '/admin', '/dev/sim', '/agent']) {
      expect(canAccess(null, p), p).toBe(false);
    }
  });

  it('/ mo cho ca 2 vai da dang nhap', () => {
    expect(canAccess('admin', '/')).toBe(true);
    expect(canAccess('operator', '/')).toBe(true);
  });

  it('nhom doc: admin GET+POST ok', () => {
    for (const p of ['/groups', '/groups/g1', '/api/groups/g1', '/persona', '/api/persona/soul', '/knowledge', '/api/knowledge/1', '/automations', '/api/automations']) {
      expect(canAccess('admin', p, 'GET'), `admin GET ${p}`).toBe(true);
      expect(canAccess('admin', p, 'POST'), `admin POST ${p}`).toBe(true);
    }
  });

  it('nhom doc: operator GET ok, POST/PUT/DELETE bi tu choi', () => {
    for (const p of ['/groups', '/api/groups/g1', '/persona', '/api/persona/soul', '/knowledge/1', '/api/knowledge', '/automations', '/api/automations/1']) {
      expect(canAccess('operator', p), `operator GET (mac dinh) ${p}`).toBe(true);
      expect(canAccess('operator', p, 'GET'), `operator GET ${p}`).toBe(true);
      expect(canAccess('operator', p, 'POST'), `operator POST ${p}`).toBe(false);
      expect(canAccess('operator', p, 'DELETE'), `operator DELETE ${p}`).toBe(false);
    }
  });

  it('nhom ca hai vai: admin va operator deu ok, ke ca POST', () => {
    for (const p of ['/approvals', '/api/approvals/1', '/leads', '/api/leads/2', '/moderation', '/api/moderation/x', '/agent', '/agent/timeline']) {
      for (const role of ['admin', 'operator'] as const) {
        expect(canAccess(role, p, 'GET'), `${role} GET ${p}`).toBe(true);
        expect(canAccess(role, p, 'POST'), `${role} POST ${p}`).toBe(true);
      }
    }
  });

  it('/zalo, /api/zalo/*, /dev/*, /api/dev/*, /admin/*: chi admin', () => {
    for (const p of ['/zalo', '/api/zalo/status', '/api/zalo/community/login', '/dev/sim', '/api/dev/sim/send', '/admin/x']) {
      expect(canAccess('admin', p), `admin ${p}`).toBe(true);
      expect(canAccess('operator', p), `operator ${p}`).toBe(false);
      expect(canAccess('operator', p, 'POST'), `operator POST ${p}`).toBe(false);
    }
  });

  it('duong khac: mac dinh tu choi cho ca 2 vai', () => {
    for (const p of ['/khong-ton-tai', '/api/khong-ton-tai/1', '/groupsX/1', '/leadsX']) {
      expect(canAccess('admin', p), `admin ${p}`).toBe(false);
      expect(canAccess('operator', p), `operator ${p}`).toBe(false);
    }
  });

  it('khop theo RANH GIOI DOAN, khong theo tien to', () => {
    expect(canAccess('admin', '/groupsX')).toBe(false);
    expect(canAccess('operator', '/groupsX')).toBe(false);
    expect(canAccess('admin', '/approvalsX')).toBe(false);
    expect(canAccess('admin', '/devices')).toBe(false);
    expect(canAccess('admin', '/zaloX')).toBe(false);
    expect(canAccess('admin', '/agents')).toBe(false);
    // dung doan van hoat dong binh thuong
    expect(canAccess('admin', '/groups')).toBe(true);
    expect(canAccess('operator', '/approvals')).toBe(true);
  });

  it('operator doc duoc tung nhom GET (groups/persona/knowledge/automations)', () => {
    expect(canAccess('operator', '/groups', 'GET')).toBe(true);
    expect(canAccess('operator', '/api/persona/rules', 'GET')).toBe(true);
    expect(canAccess('operator', '/knowledge', 'GET')).toBe(true);
    expect(canAccess('operator', '/api/automations/1', 'GET')).toBe(true);
  });

  it('operator ghi (POST/PUT/PATCH/DELETE) tung nhom doc bi tu choi', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(canAccess('operator', '/api/groups/1', m), `groups ${m}`).toBe(false);
      expect(canAccess('operator', '/api/knowledge/1', m), `knowledge ${m}`).toBe(false);
    }
  });

  it('operator duyet the / sua lead / kiem duyet duoc ghi', () => {
    expect(canAccess('operator', '/api/approvals/1', 'POST')).toBe(true);
    expect(canAccess('operator', '/api/leads/1', 'PATCH')).toBe(true);
    expect(canAccess('operator', '/api/moderation/x', 'POST')).toBe(true);
  });

  it('/agent chi la trang (khong co /api/agent trong bang): /api/agent bi tu choi', () => {
    expect(canAccess('admin', '/agent')).toBe(true);
    expect(canAccess('operator', '/agent/timeline')).toBe(true);
    expect(canAccess('admin', '/api/agent')).toBe(false);
  });

  it('chua dang nhap voi method POST van chi /login va /api/auth/*', () => {
    expect(canAccess(null, '/api/approvals/1', 'POST')).toBe(false);
    expect(canAccess(null, '/api/auth/login', 'POST')).toBe(true);
  });

  it('method khong phan biet hoa thuong; HEAD tinh la doc', () => {
    expect(canAccess('operator', '/groups', 'get')).toBe(true);
    expect(canAccess('operator', '/groups', 'HEAD')).toBe(true);
    expect(canAccess('operator', '/groups', 'post')).toBe(false);
  });
});
