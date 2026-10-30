/**
 * Bàn giao thiết kế sang thi công cần đầu bài đã xác nhận và khảo sát thiết kế (hoặc lý do bỏ qua) —
 * 0256, câu 5. Phép thử chỉ cần đi qua bước bàn giao thì gọi hàm này cho hồ sơ thiết kế trước.
 *
 * Ghi thẳng bằng kết nối máy chủ (như phát hành bản vẽ bằng SQL ở các phép thử khác): cột lý do bỏ khảo
 * sát chỉ đổi qua hàm, nhưng kết nối `postgres` không mang người dùng nên đi qua được.
 */
export async function markDesignHandoverReady(designProjectId: string): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`
      INSERT INTO design_briefs (company_id, design_project_id, design_task, confirmed_at)
      SELECT p.company_id, p.id, '[TEST] Đầu bài đã xác nhận', now()
        FROM design_projects p
       WHERE p.id = ${designProjectId}
         AND NOT EXISTS (SELECT 1 FROM design_briefs b
                          WHERE b.design_project_id = p.id AND b.is_current_version
                            AND b.confirmed_at IS NOT NULL AND b.deleted_at IS NULL)`;
    await sql`
      UPDATE design_projects
         SET survey_waived_reason = '[TEST] Khách gửi sẵn bản đo hiện trạng', survey_waived_at = now()
       WHERE id = ${designProjectId} AND survey_waived_reason IS NULL`;
  } finally {
    await sql.end();
  }
}
