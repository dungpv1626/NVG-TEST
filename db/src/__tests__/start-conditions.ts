/**
 * Điều kiện khởi công (G4, 0249): công trình mới chụp danh mục của pháp nhân, mục bắt buộc (pháp lý,
 * an toàn — đề xuất DEMO) chặn sang «Đang thi công». Phép thử kiểm THỨ TỰ bước ở chỗ khác gọi hàm này
 * để coi như các điều kiện đã xác nhận (kể cả ngân sách đã duyệt — 0253); cổng điều kiện có phép thử riêng (`g4-ban-giao-ngan-sach`).
 */

export async function confirmStartConditions(siteId: string): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`
      UPDATE site_checklist_items
         SET status = 'da_dat', note = 'Đã xác nhận trong phép thử', confirmed_at = now()
       WHERE construction_site_id = ${siteId} AND kind = 'khoi_cong'`;
    // 0253: ngân sách thi công ban đầu phải được Tổng Giám đốc duyệt trước khởi công. Phép thử thứ tự bước
    // coi như đã duyệt; cổng ngân sách có phép thử riêng (`goi-a-nghiep-vu`).
    await sql`
      INSERT INTO site_budget_submissions (company_id, construction_site_id, round_no, total_amount, status,
                                           decided_at, note)
      SELECT s.company_id, s.id,
             COALESCE((SELECT max(round_no) FROM site_budget_submissions WHERE construction_site_id = s.id), 0) + 1,
             0, 'da_duyet', now(), 'Đã duyệt trong phép thử'
        FROM construction_sites s
       WHERE s.id = ${siteId}
         AND NOT EXISTS (SELECT 1 FROM site_budget_submissions x
                          WHERE x.construction_site_id = s.id AND x.status IN ('da_duyet', 'cho_duyet'))`;
  } finally {
    await sql.end();
  }
}
