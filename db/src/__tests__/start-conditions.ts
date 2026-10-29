/**
 * Điều kiện khởi công (G4, 0249): công trình mới chụp danh mục của pháp nhân, mục bắt buộc (pháp lý,
 * an toàn — đề xuất DEMO) chặn sang «Đang thi công». Phép thử kiểm THỨ TỰ bước ở chỗ khác gọi hàm này
 * để coi như các điều kiện đã xác nhận; cổng điều kiện có phép thử riêng (`g4-ban-giao-ngan-sach`).
 */

export async function confirmStartConditions(siteId: string): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`
      UPDATE site_checklist_items
         SET status = 'da_dat', note = 'Đã xác nhận trong phép thử', confirmed_at = now()
       WHERE construction_site_id = ${siteId} AND kind = 'khoi_cong'`;
  } finally {
    await sql.end();
  }
}
