/**
 * Mốc thi công — nghiệm thu trước khi che khuất (Đợt 2 — 2A, 0182).
 *
 * Hàng rào phải đứng:
 *  - Công trình NVO mới mở tự có 7 mốc (bộ mốc mặc định), mốc đầu đang làm.
 *  - Mốc sau không nghiệm thu được khi mốc trước chưa đạt; trình duyệt không tự đổi trạng thái mốc.
 *  - Biên bản có mục Không đạt thì mốc chưa đạt.
 *  - Mốc cần lớp kỹ thuật: người lập biên bản không tự kiểm; trả lại phải có ý kiến; Trưởng phòng
 *    Thi công đồng ý thì mốc đạt và mốc sau mở.
 *  - Chưa đạt đủ mốc thì công trình không sang Nghiệm thu bàn giao.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/site-milestones.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Milestone {
  id: string;
  position: number;
  step_key: string;
  status: string;
  acceptance_checklist_id: string;
  requires_technical_check: boolean;
}

describeDb('Mốc thi công NVO (0182)', () => {
  let chiHuy: SupabaseClient;
  let truongPhong: SupabaseClient;
  let chiHuyNvc: SupabaseClient;
  let siteId: string;

  async function milestones(): Promise<Milestone[]> {
    const { data, error } = await chiHuy
      .from('site_milestones')
      .select('id, position, step_key, status, acceptance_checklist_id, requires_technical_check')
      .eq('construction_site_id', siteId)
      .order('position');
    expect(error).toBeNull();
    return (data ?? []) as Milestone[];
  }

  /** Kết quả chấm cho mọi mục của danh mục; `failKey` = mục chấm Không đạt. */
  async function answers(checklistId: string, failKey?: string) {
    const { data, error } = await chiHuy
      .from('acceptance_checklists')
      .select('items')
      .eq('id', checklistId)
      .single();
    expect(error).toBeNull();
    const items = (data as { items: { key: string; requires_photo: boolean }[] }).items;
    return items.map((i) => ({
      key: i.key,
      result: i.key === failKey ? 'khong_dat' : 'dat',
      note: i.key === failKey ? 'Sai cao độ 3 cm' : null,
      photo_paths: i.requires_photo ? [`${siteId}/nghiem-thu/${i.key}.jpg`] : [],
    }));
  }

  beforeAll(async () => {
    [chiHuy, truongPhong, chiHuyNvc] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvo),
      signInAs(ACCOUNTS.congTruongNvo),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
    ]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
      const [cht] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
      const [site] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites
          (company_id, code, name, stage, responsible_user_id, planned_start_date, planned_end_date)
        VALUES (${nvo!.id}, ${'NVO-CT-M' + stamp}, ${TEST_PREFIX + ' Nhà ở 7 mốc ' + stamp},
                'dang_thi_cong', ${cht!.id}, current_date, current_date + 120)
        RETURNING id`;
      siteId = site!.id;
    } finally {
      await sql.end();
    }
  });

  afterAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`DELETE FROM construction_sites WHERE id = ${siteId}`;
    } finally {
      await sql.end();
    }
  });

  it('công trình NVO mới tự có 7 mốc, mốc đầu đang làm; chỉ huy trưởng NVC không thấy', async () => {
    const list = await milestones();
    expect(list.map((m) => m.step_key)).toEqual([
      'dinh_vi',
      'mong',
      'ket_cau',
      'xay_trat_mep',
      'chong_tham',
      'hoan_thien',
      'kiem_tra_cl',
    ]);
    expect(list.map((m) => m.status)).toEqual([
      'dang_lam',
      'cho_lam',
      'cho_lam',
      'cho_lam',
      'cho_lam',
      'cho_lam',
      'cho_lam',
    ]);
    const { data: other } = await chiHuyNvc
      .from('site_milestones')
      .select('id')
      .eq('construction_site_id', siteId);
    expect(other).toEqual([]);
  });

  it('mốc sau không nghiệm thu được khi mốc trước chưa đạt; không tự đổi trạng thái mốc', async () => {
    const [first, second] = await milestones();
    const { error } = await chiHuy.rpc('record_milestone_acceptance', {
      p_milestone_id: second!.id,
      p_results: await answers(second!.acceptance_checklist_id),
    });
    expect(error?.message).toContain('Mốc trước chưa đạt');

    const { error: direct } = await chiHuy
      .from('site_milestones')
      .update({ status: 'dat' })
      .eq('id', first!.id);
    expect(direct).not.toBeNull();
    expect((await milestones())[0]!.status).toBe('dang_lam');
  });

  it('chưa đạt đủ mốc thì công trình không sang Nghiệm thu bàn giao', async () => {
    const { error } = await chiHuy.rpc('move_site_stage', {
      p_site_id: siteId,
      p_stage: 'nghiem_thu',
    });
    expect(error?.message).toContain('Đạt đủ các mốc thi công');
  });

  it('mục Không đạt giữ mốc lại; lớp kỹ thuật kiểm độc lập, trả lại phải có ý kiến; đạt thì mở mốc sau', async () => {
    const [first] = await milestones();
    expect(first!.requires_technical_check).toBe(true);

    // Không đạt: biên bản vẫn lập (có tồn tại), mốc vẫn đang làm.
    const failed = await chiHuy.rpc('record_milestone_acceptance', {
      p_milestone_id: first!.id,
      p_results: await answers(first!.acceptance_checklist_id, 'cao_do'),
      p_outstanding_issues: 'Cao độ ±0.000 lệch 3 cm — đo lại',
    });
    expect(failed.error).toBeNull();
    expect(failed.data).toBe('khong_dat');
    expect((await milestones())[0]!.status).toBe('dang_lam');

    // Đạt nội bộ → chờ phụ trách kỹ thuật.
    const ok = await chiHuy.rpc('record_milestone_acceptance', {
      p_milestone_id: first!.id,
      p_results: await answers(first!.acceptance_checklist_id),
    });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe('cho_ky_thuat');

    // Người lập không tự kiểm.
    const self = await chiHuy.rpc('review_milestone_technical', {
      p_milestone_id: first!.id,
      p_approve: true,
    });
    expect(self.error).not.toBeNull();

    // Trả lại phải có ý kiến.
    const noNote = await truongPhong.rpc('review_milestone_technical', {
      p_milestone_id: first!.id,
      p_approve: false,
    });
    expect(noNote.error?.message).toContain('Ghi rõ');

    const back = await truongPhong.rpc('review_milestone_technical', {
      p_milestone_id: first!.id,
      p_approve: false,
      p_note: 'Đo lại tim trục trục C',
    });
    expect(back.error).toBeNull();
    expect((await milestones())[0]!.status).toBe('dang_lam');

    // Lập lại, Trưởng phòng đồng ý → đạt, mốc móng mở.
    const again = await chiHuy.rpc('record_milestone_acceptance', {
      p_milestone_id: first!.id,
      p_results: await answers(first!.acceptance_checklist_id),
    });
    expect(again.data).toBe('cho_ky_thuat');
    const approve = await truongPhong.rpc('review_milestone_technical', {
      p_milestone_id: first!.id,
      p_approve: true,
    });
    expect(approve.error).toBeNull();
    const after = await milestones();
    expect(after[0]!.status).toBe('dat');
    expect(after[1]!.status).toBe('dang_lam');

    const { data: events } = await chiHuy
      .from('site_milestone_events')
      .select('event')
      .eq('site_milestone_id', first!.id)
      .order('created_at');
    expect((events ?? []).map((e) => (e as { event: string }).event)).toEqual([
      'bat_dau',
      'khong_dat',
      'cho_ky_thuat',
      'tra_lai',
      'cho_ky_thuat',
      'dat',
    ]);
  });

  it('Trưởng phòng tự lập biên bản mốc thì không tự kiểm lớp kỹ thuật', async () => {
    const second = (await milestones())[1]!;
    const { data: answersByTp } = await truongPhong
      .from('acceptance_checklists')
      .select('items')
      .eq('id', second.acceptance_checklist_id)
      .single();
    const items = (answersByTp as { items: { key: string; requires_photo: boolean }[] }).items;
    const recorded = await truongPhong.rpc('record_milestone_acceptance', {
      p_milestone_id: second.id,
      p_results: items.map((i) => ({
        key: i.key,
        result: 'dat',
        photo_paths: i.requires_photo ? [`${siteId}/nghiem-thu/${i.key}.jpg`] : [],
      })),
    });
    expect(recorded.data).toBe('cho_ky_thuat');
    const self = await truongPhong.rpc('review_milestone_technical', {
      p_milestone_id: second.id,
      p_approve: true,
    });
    expect(self.error?.message).toContain('kiểm độc lập');
    expect((await milestones())[1]!.status).toBe('cho_ky_thuat');
  });
});
