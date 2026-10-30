/**
 * Một cơ hội: một hợp đồng thiết kế + một hợp đồng thi công, HOẶC một hợp đồng trọn gói (0243).
 *
 * Quy trình NVO anh Bùi Văn Thi kể trong hồ sơ khảo sát: ký hợp đồng THIẾT KẾ trước (khách trả tiền
 * thiết kế theo đợt), thiết kế được duyệt mới dự toán và ký hợp đồng THI CÔNG riêng. 0159 chỉ cho
 * một hợp đồng mỗi cơ hội nên chặn đúng quy trình này.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/hai-hop-dong.test.ts`
 */

import { describe, expect, it } from 'vitest';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';
import { markDesignHandoverReady } from './design-handover-ready';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('hai hợp đồng một cơ hội — thiết kế rồi thi công (0243)', () => {
  type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

  async function withSql<T>(fn: (sql: Sql) => Promise<T>) {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      return await fn(sql);
    } finally {
      await sql.end();
    }
  }

  /** Cơ hội NVO ở bước Đàm phán do Kinh doanh NVO phụ trách — dựng thẳng bằng SQL. */
  async function opportunity(): Promise<{ id: string; companyId: string; ownerId: string }> {
    return withSql(async (sql) => {
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const [nvo] = await sql`SELECT id FROM companies WHERE code = 'NVO'`;
      const [customer] = await sql`SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1`;
      const [owner] = await sql`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
      const [opp] = await sql`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvo!.id}, ${'HHD-CH-' + stamp}, ${customer!.id},
                ${TEST_PREFIX + ' Hai hợp đồng ' + stamp}, ${owner!.id}, 'dam_phan')
        RETURNING id`;
      return { id: opp!.id as string, companyId: nvo!.id as string, ownerId: owner!.id as string };
    });
  }

  async function draft(
    oppId: string,
    type: 'thiet_ke' | 'thi_cong',
    scopeKind: 'tron_goi' | null = null,
  ) {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    return kd.rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: oppId,
      p_type: type,
      p_title: `${TEST_PREFIX} Hợp đồng ${scopeKind ?? type}`,
      p_scope_kind: scopeKind,
    });
  }

  async function mustDraft(oppId: string, type: 'thiet_ke' | 'thi_cong', scope?: 'tron_goi') {
    const { data, error } = await draft(oppId, type, scope ?? null);
    expect(error?.message ?? null).toBeNull();
    return data as string;
  }

  /** Phê duyệt nội bộ bằng SQL rồi Ban Giám đốc ghi nhận đã ký qua đúng hàm (0187). */
  async function sign(contractId: string) {
    await withSql((sql) => sql`UPDATE contracts SET stage = 'da_duyet' WHERE id = ${contractId}`);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { error } = await tgd.rpc('sign_contract', {
      p_contract_id: contractId,
      p_contract_number: `HHD-${contractId.slice(0, 8)}`,
      p_signed_date: null,
    });
    expect(error?.message ?? null).toBeNull();
  }

  const oppStage = (id: string) =>
    withSql(async (sql) => {
      const [o] = await sql`SELECT stage::text AS stage FROM opportunities WHERE id = ${id}`;
      return o!.stage as string;
    });

  const sitesOf = (contractId: string) =>
    withSql(async (sql) => {
      const rows = await sql`SELECT id FROM construction_sites
                              WHERE contract_id = ${contractId} AND deleted_at IS NULL`;
      return rows.length;
    });

  it('hợp đồng thiết kế rồi hợp đồng thi công cho cùng cơ hội — được', async () => {
    const opp = await opportunity();
    const design = await mustDraft(opp.id, 'thiet_ke');
    const build = await mustDraft(opp.id, 'thi_cong');
    const kinds = await withSql(
      (sql) =>
        sql`SELECT scope_kind FROM contracts WHERE id IN (${design}, ${build}) ORDER BY created_at`,
    );
    expect(kinds.map((k) => k.scope_kind)).toEqual(['thiet_ke', 'thi_cong']);

    // Giao diện hỏi còn soạn được gì: cả hai hợp đồng đều trong nhóm của cơ hội.
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: group } = await kd.rpc('contract_group_contracts', {
      p_entity_type: 'opportunity',
      p_id: opp.id,
    });
    expect((group as { scope_kind: string }[]).map((g) => g.scope_kind)).toEqual([
      'thiet_ke',
      'thi_cong',
    ]);
  });

  it('hai hợp đồng thiết kế — bị chặn', async () => {
    const opp = await opportunity();
    await mustDraft(opp.id, 'thiet_ke');
    const { error } = await draft(opp.id, 'thiet_ke');
    expect(error?.message).toContain('đã có hợp đồng thiết kế');
  });

  it('trọn gói đi cùng hợp đồng thiết kế — bị chặn cả hai chiều; hợp đồng đã hủy không tính', async () => {
    const a = await opportunity();
    await mustDraft(a.id, 'thiet_ke');
    const { error: afterDesign } = await draft(a.id, 'thi_cong', 'tron_goi');
    expect(afterDesign?.message).toContain('trọn gói');

    const b = await opportunity();
    const tronGoi = await mustDraft(b.id, 'thi_cong', 'tron_goi');
    const { error: afterTronGoi } = await draft(b.id, 'thiet_ke');
    expect(afterTronGoi?.message).toContain('đã có hợp đồng thiết kế – thi công trọn gói');

    await withSql(
      (sql) => sql`UPDATE contracts SET stage = 'huy', cancel_reason = 'Thử' WHERE id = ${tronGoi}`,
    );
    await mustDraft(b.id, 'thiet_ke');
  });

  it('ký hợp đồng thiết kế: cơ hội vẫn mở, không mở công trình, người phụ trách được báo', async () => {
    const opp = await opportunity();
    const design = await mustDraft(opp.id, 'thiet_ke');
    await sign(design);
    expect(await oppStage(opp.id)).toBe('dam_phan');
    expect(await sitesOf(design)).toBe(0);
    const [n] = await withSql(
      (sql) => sql`SELECT count(*)::int AS c FROM notifications
                    WHERE related_entity_id = ${opp.id} AND user_id = ${opp.ownerId}
                      AND type = 'design_contract_signed'`,
    );
    expect(n!.c).toBe(1);

    // 0253: ký hợp đồng thiết kế thì máy tạo hồ sơ thiết kế gắn cơ hội + hợp đồng.
    const [dp] = await withSql(
      (sql) => sql`SELECT count(*)::int AS c FROM design_projects
                    WHERE opportunity_id = ${opp.id} AND contract_id = ${design} AND deleted_at IS NULL`,
    );
    expect(dp!.c).toBe(1);

    // Vẫn soạn được hợp đồng thi công sau đó (cơ hội vẫn ở Đàm phán).
    const build = await mustDraft(opp.id, 'thi_cong');
    await sign(build);
    expect(await oppStage(opp.id)).toBe('ky_hop_dong');
    expect(
      await sitesOf(build),
      'cơ hội còn hồ sơ thiết kế đang làm: công trình mở lúc bàn giao thiết kế (0243 / 0250), không mở khi ký',
    ).toBe(0);
  });

  it('ký hợp đồng trọn gói NVO: cơ hội sang Ký hợp đồng, có hồ sơ thiết kế, công trình chờ bàn giao thiết kế', async () => {
    const opp = await opportunity();
    const tronGoi = await mustDraft(opp.id, 'thi_cong', 'tron_goi');
    await sign(tronGoi);
    expect(await oppStage(opp.id)).toBe('ky_hop_dong');
    // 0253: NVO tự làm thiết kế (`tk.design_in_house`) → hồ sơ thiết kế trước, công trình mở lúc bàn giao.
    const [dp] = await withSql(
      (sql) => sql`SELECT count(*)::int AS c FROM design_projects
                    WHERE opportunity_id = ${opp.id} AND contract_id = ${tronGoi} AND deleted_at IS NULL`,
    );
    expect(dp!.c).toBe(1);
    expect(await sitesOf(tronGoi)).toBe(0);
  });

  it('bàn giao thiết kế: hợp đồng thiết kế đã ký không đủ; có hợp đồng thi công đã ký thì gắn vào công trình', async () => {
    const opp = await opportunity();
    await withSql(async (sql) => {
      const stamp = `${Date.now()}`;
      const [d] = await sql`
        INSERT INTO design_projects (company_id, code, name, stage, opportunity_id)
        VALUES (${opp.companyId}, ${'HHD-TK-' + stamp}, ${TEST_PREFIX + ' Thiết kế ' + stamp},
                'du_toan', ${opp.id})
        RETURNING id`;
      await sql`
        INSERT INTO contracts (company_id, code, title, type, stage, source_type, source_id, signed_date)
        VALUES (${opp.companyId}, ${'HDTEST-HHD-TK-' + stamp}, ${TEST_PREFIX + ' HĐ thiết kế ' + stamp},
                'thiet_ke', 'da_ky', 'design_projects', ${d!.id}, current_date)`;
      const openSite = () => sql`
        INSERT INTO construction_sites (company_id, code, name, planned_end_date, design_project_id)
        VALUES (${opp.companyId}, ${'HHD-CT-' + stamp + '-' + Math.round(Math.random() * 1e6)},
                ${TEST_PREFIX + ' Công trình ' + stamp}, current_date + 90, ${d!.id})
        RETURNING id, contract_id`;
      await expect(openSite()).rejects.toThrow(/Hợp đồng thiết kế không đủ/);

      // Hợp đồng thi công ký từ CƠ HỘI gốc (không phải từ hồ sơ thiết kế) vẫn mở được cổng.
      const [build] = await sql`
        INSERT INTO contracts (company_id, code, title, type, stage, source_type, source_id, signed_date)
        VALUES (${opp.companyId}, ${'HDTEST-HHD-TC-' + stamp}, ${TEST_PREFIX + ' HĐ thi công ' + stamp},
                'thi_cong', 'da_ky', 'opportunities', ${opp.id}, current_date)
        RETURNING id`;
      const [site] = await openSite();
      expect(site!.contract_id).toBe(build!.id);
    });
  });

  it('cơ hội có hồ sơ thiết kế đang làm: ký hợp đồng thi công KHÔNG tự mở công trình (mở lúc bàn giao)', async () => {
    const opp = await opportunity();
    await withSql(
      (sql) => sql`
        INSERT INTO design_projects (company_id, code, name, stage, opportunity_id)
        VALUES (${opp.companyId}, ${'HHD-TK2-' + Date.now()}, ${TEST_PREFIX + ' Thiết kế đang làm'},
                'phuong_an', ${opp.id})`,
    );
    const build = await mustDraft(opp.id, 'thi_cong');
    await sign(build);
    expect(await oppStage(opp.id)).toBe('ky_hop_dong');
    expect(await sitesOf(build), 'tránh hai công trình cho một nhà').toBe(0);
  });

  it('0250: còn hồ sơ thiết kế đang làm thì không mở công trình thẳng từ hợp đồng thi công; bàn giao mở công trình không lấy kiến trúc sư làm chỉ huy', async () => {
    // Chạy thử NVO 30/10/2026: trang hợp đồng mời «Mở công trình» — bấm thì lúc bàn giao thiết kế
    // không còn hợp đồng nào để gắn; bàn giao lại lấy kiến trúc sư chủ trì làm chỉ huy công trình.
    const opp = await opportunity();
    const [designer] = await withSql(
      (sql) => sql`SELECT id FROM users WHERE email = ${ACCOUNTS.thietKeNvo}`,
    );
    const stamp = `${Date.now()}`;
    const [design] = await withSql(
      (sql) => sql`
        INSERT INTO design_projects (company_id, code, name, stage, opportunity_id, responsible_user_id)
        VALUES (${opp.companyId}, ${'HHD-TK3-' + stamp}, ${TEST_PREFIX + ' Thiết kế chờ bàn giao'},
                'du_toan', ${opp.id}, ${designer!.id})
        RETURNING id, code`,
    );
    const build = await mustDraft(opp.id, 'thi_cong');
    await withSql(
      (sql) =>
        sql`UPDATE contracts SET start_date = '2026-12-01', end_date = '2027-06-30' WHERE id = ${build}`,
    );
    await sign(build);

    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: pending } = await kd.rpc('contract_pending_design', { p_contract_id: build });
    expect((pending as { code: string }[]).map((p) => p.code)).toEqual([design!.code]);

    const tgd = await signInAs(ACCOUNTS.tgd);
    const { error: openError } = await tgd.rpc('open_site_from_contract', { p_contract_id: build });
    expect(openError?.message).toContain('công trình tự mở khi Thiết kế bàn giao');
    expect(await sitesOf(build)).toBe(0);

    // Đủ điều kiện bàn giao: phương án khách đã duyệt + ba bộ môn đã phát hành. Thêm bản nháp rồi
    // phát hành bằng SQL — trigger chèn luôn xoá dấu phát hành (chỉ phát hành qua hàm).
    await withSql(async (sql) => {
      for (const d of ['phuong_an', 'kien_truc', 'ket_cau', 'dien_nuoc']) {
        const [v] = await sql`
          INSERT INTO design_versions (company_id, design_project_id, discipline, title)
          VALUES (${opp.companyId}, ${design!.id}, ${d}::design_discipline, ${TEST_PREFIX + ' ' + d})
          RETURNING id`;
        await sql`
          UPDATE design_versions
             SET published_at = now(), is_current_version = true,
                 customer_approved_at = CASE WHEN discipline = 'phuong_an' THEN now() END
           WHERE id = ${v!.id}`;
      }
    });
    // 0256: đầu bài đã xác nhận + lý do không khảo sát.
    await markDesignHandoverReady(design!.id);
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const { error: handError } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: design!.id,
    });
    expect(handError?.message ?? null).toBeNull();
    const [site] = await withSql(
      (sql) => sql`
        SELECT contract_id, responsible_user_id, planned_start_date::text AS s, name
          FROM construction_sites WHERE design_project_id = ${design!.id}`,
    );
    expect(site!.contract_id).toBe(build);
    expect(site!.responsible_user_id, 'kiến trúc sư không làm chỉ huy công trình').toBeNull();
    expect(site!.s).toBe('2026-12-01');
    expect(site!.name).toContain('Hợp đồng thi_cong');
    const { data: after } = await kd.rpc('contract_pending_design', { p_contract_id: build });
    expect(after).toEqual([]);
  });

  it('«Chỉ thiết kế»: ghi lịch sử, chặn hợp đồng thi công, hợp đồng thiết kế ký thì cơ hội thắng', async () => {
    const opp = await opportunity();
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);

    // Chưa có hợp đồng thiết kế thì chưa đánh dấu được.
    const { error: tooEarly } = await kd.rpc('mark_opportunity_design_only', {
      p_opportunity_id: opp.id,
      p_reason: null,
    });
    expect(tooEarly?.message).toContain('chưa có hợp đồng thiết kế');

    const design = await mustDraft(opp.id, 'thiet_ke');
    // Không đặt cờ thẳng bằng PATCH để đi vòng qua kiểm tra và lịch sử.
    const { error: direct } = await kd
      .from('opportunities')
      .update({ design_only_at: new Date().toISOString() })
      .eq('id', opp.id);
    expect(direct?.message).toContain('Không đổi trực tiếp');

    const { error } = await kd.rpc('mark_opportunity_design_only', {
      p_opportunity_id: opp.id,
      p_reason: 'Khách tự thuê đội thi công',
    });
    expect(error?.message ?? null).toBeNull();
    const history = await withSql(
      (sql) => sql`SELECT note FROM opportunity_stage_history WHERE opportunity_id = ${opp.id}`,
    );
    expect(history.map((h) => h.note).join(' | ')).toContain(
      'Chỉ thiết kế: Khách tự thuê đội thi công',
    );

    const { error: build } = await draft(opp.id, 'thi_cong');
    expect(build?.message).toContain('Chỉ thiết kế');

    expect(await oppStage(opp.id)).toBe('dam_phan');
    await sign(design);
    expect(await oppStage(opp.id), 'khách chỉ mua thiết kế: hợp đồng thiết kế ký là thắng').toBe(
      'ky_hop_dong',
    );
    expect(await sitesOf(design)).toBe(0);
  });

  it('hợp đồng thiết kế đã ký rồi mới đánh dấu «Chỉ thiết kế» — cơ hội sang Ký hợp đồng ngay', async () => {
    const opp = await opportunity();
    const design = await mustDraft(opp.id, 'thiet_ke');
    await sign(design);
    expect(await oppStage(opp.id)).toBe('dam_phan');
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { error } = await kd.rpc('mark_opportunity_design_only', {
      p_opportunity_id: opp.id,
      p_reason: null,
    });
    expect(error?.message ?? null).toBeNull();
    expect(await oppStage(opp.id)).toBe('ky_hop_dong');
  });

  it('soạn văn bản từ mẫu trọn gói đổi hợp đồng thi công thành trọn gói — và bị chặn khi đã có hợp đồng thiết kế', async () => {
    const opp = await opportunity();
    await mustDraft(opp.id, 'thiet_ke');
    const build = await mustDraft(opp.id, 'thi_cong');
    await withSql(async (sql) => {
      const [tpl] = await sql`SELECT id FROM contract_templates
                               WHERE company_id = ${opp.companyId} AND scope_kind = 'tron_goi' AND is_active
                               LIMIT 1`;
      expect(tpl, 'mẫu NVO-HĐ-02 đã nạp và mang scope_kind tron_goi').toBeTruthy();
      await expect(
        sql`INSERT INTO contract_documents (company_id, contract_id, template_id, version, storage_path, file_name)
            VALUES (${opp.companyId}, ${build}, ${tpl!.id}, 1, ${build + '/thu.docx'}, 'thu.docx')`,
      ).rejects.toThrow(/trọn gói/);
    });
  });
});
