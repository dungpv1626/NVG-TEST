/**
 * Biến môi trường và binding của Module Thiết kế AI.
 *
 * Tách khỏi `workers/src/index.ts` để phần nghiệp vụ thiết kế không kéo theo ràng buộc gì
 * lên Worker cron NEN-04 đang chạy.
 */

export interface DesignEnv {
  SUPABASE_URL: string;
  /**
   * Nguồn được phép gọi API từ trình duyệt, ngăn cách bằng dấu phẩy.
   *
   * Để trống thì chỉ cho phép máy phát triển — mặc định phải là mức hẹp nhất, vì mở rộng là
   * việc phải làm có ý thức còn thu hẹp thì không ai nhớ.
   */
  ALLOWED_ORIGINS?: string;
  /** ⚠️ Vượt RLS. CHỈ dùng trong Workers, không bao giờ ở `web/` (CLAUDE.md 5.5). */
  SUPABASE_SERVICE_ROLE_KEY: string;

  /** Khoá gọi mô hình ngôn ngữ. Chưa có ở giai đoạn này — router tự báo "chưa cấu hình". */
  GEMINI_API_KEY?: string;

  /**
   * Khoá Pollinations (`sk_…`) — nhà cung cấp của tuyến phối cảnh trong giai đoạn dev và test.
   *
   * Tách khỏi `GEMINI_API_KEY` chứ không dùng chung một biến "khoá AI": hai nhà cung cấp có
   * chính sách lưu trữ khác nhau, nên chỗ nào gọi ai phải nhìn thấy được. Router tự khớp khoá
   * theo `provider` của từng tuyến (`llm/router.ts`), nên đổi nhà cung cấp trong
   * `config/models.yaml` là đổi luôn khoá được dùng.
   */
  POLLINATIONS_API_KEY?: string;

  /**
   * Khoá OpenAI và Anthropic — nhánh thiết kế bằng AI (T10–T13, 08/09/2026). API trả phí của
   * cả hai cam kết không huấn luyện trên dữ liệu gửi qua API, là căn cứ để tuyến `ai_*` nhận
   * dữ liệu hạng 2 (T12). Mỗi nhà cung cấp một biến, cùng lý do với `POLLINATIONS_API_KEY`.
   */
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /**
   * Khoá Gemini GÓI TRẢ PHÍ — nhà cung cấp `gemini_paid` trong `config/models.yaml`, tách hẳn
   * khỏi `GEMINI_API_KEY` (gói miễn phí, chỉ tuyến hạng 3). Cùng API, khác cam kết: chính sách
   * hạng dữ liệu bám vào khoá nào được cấp, nên hai khoá không được dùng chung một biến.
   */
  GEMINI_PAID_API_KEY?: string;

  /**
   * Địa chỉ Container số hoá hồ sơ cũ khi chạy bằng Docker tại chỗ (gói Cloudflare Free chưa có
   * Containers — quyết định T3). Khi nâng gói thì đổi sang binding Durable Object, chỗ đổi
   * nằm đúng một tệp: `compute-backend.ts`.
   */
  DESIGN_COMPUTE_URL?: string;

  /** Kho artifact đang dùng: `supabase` (mặc định) hoặc `r2` khi đã bật thanh toán. */
  DESIGN_ARTIFACT_STORE?: string;

  /** Bucket R2 — chỉ có khi đã nâng gói. Xem `wrangler.jsonc`. */
  DESIGN_ARTIFACTS?: R2Bucket;

  /** Bucket R2 cho tệp nguồn CAD — tách khỏi artifact, xem `source-files.ts`. */
  DESIGN_SOURCES?: R2Bucket;

  /** Bucket R2 cho ảnh do mô hình sinh — tách khỏi artifact, xem `render-store.ts`. */
  DESIGN_RENDERS?: R2Bucket;

  /** Workflow số hoá hồ sơ cũ (Mốc 3). Mỗi tệp là một bước chạy lại riêng được. */
  DIGITISE_PIPELINE?: Workflow;

  /**
   * Workflow của NHÁNH AI (`workflows/ai-design.ts`) — một instance cho một giai đoạn.
   *
   * Không bật được (chạy ngoài runtime Workers) thì tuyến khởi động trả 503 kèm lý do, không âm
   * thầm chạy đồng bộ.
   */
  AI_DESIGN_PIPELINE?: Workflow;
}
