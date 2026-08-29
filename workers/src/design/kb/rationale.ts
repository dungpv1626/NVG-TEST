/**
 * Bước 3 số hoá — tri thức ngầm của kiến trúc sư, và văn bản đem đi nhúng.
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.1 Bước 3 và 6.2.
 *
 * ⚠️ **Đây là chỗ quyết định dữ liệu gì rời khỏi hệ thống.** Cả bản ghi Knowledge Base mô tả
 * một công trình THẬT của một khách hàng THẬT. Giai đoạn demo chỉ được gửi dữ liệu giả lập
 * hoặc đã ẩn danh tới gói Gemini miễn phí (CLAUDE.md 5.1, quyết định T8) — nên hàm dựng văn
 * bản nhúng ở đây làm việc theo **danh sách CHO PHÉP**, không phải danh sách loại trừ:
 *
 *   Đi ra  : loại hình, số tầng, hồ sơ gia đình, phong cách, danh sách LOẠI phòng,
 *            và các lựa chọn rời rạc của phần chú giải (mã dạng `lay_sang_gieng_troi`).
 *   Ở lại  : mã công trình, mã dự án, kích thước lô thật, đa giác phòng, và MỌI ô chữ tự do
 *            — vì "nếu làm lại sẽ đổi gì" là chỗ tự nhiên nhất để một cái tên khách hàng lọt vào.
 *
 * Danh sách loại trừ sẽ hỏng vào ngày hợp đồng thêm một trường mới; danh sách cho phép thì
 * trường mới mặc định KHÔNG đi đâu cả. Có kiểm thử canh chiều này.
 */

/** Lựa chọn rời rạc trông như thế nào — cùng dạng mã với loại phòng. */
const PRESET_CODE = /^[a-z][a-z0-9_]*$/;

export interface RationalePayload {
  stair_position?: string | null;
  kitchen_position?: string | null;
  biggest_constraint?: string | null;
  would_change?: string | null;
}

interface EmbeddableRecord {
  building_type?: string;
  floors?: number;
  family_archetype?: string | null;
  style?: string | null;
  floor_plans?: { rooms: { type?: string | null }[] }[];
  rationale?: RationalePayload | null;
}

/**
 * Văn bản đem đi nhúng.
 *
 * Trả chuỗi rỗng khi không còn gì để nhúng — lớp gọi phải hiểu đó là "không tính vector",
 * không phải "vector của chuỗi rỗng".
 */
export function embeddingText(record: EmbeddableRecord): string {
  const parts: string[] = [];

  if (record.building_type) parts.push(`loại hình: ${record.building_type}`);
  if (typeof record.floors === 'number') parts.push(`số tầng: ${record.floors}`);
  if (record.family_archetype) parts.push(`gia đình: ${record.family_archetype}`);
  if (record.style) parts.push(`phong cách: ${record.style}`);

  const rooms = new Set<string>();
  for (const plan of record.floor_plans ?? []) {
    for (const room of plan.rooms ?? []) {
      if (room.type && PRESET_CODE.test(room.type)) rooms.add(room.type);
    }
  }
  // Sắp xếp để cùng một bản ghi luôn cho ra cùng một chuỗi: vector phải lặp lại được, nếu
  // không thì nhúng lại cả kho sẽ làm thay đổi kết quả truy hồi mà không ai sửa gì.
  if (rooms.size) parts.push(`phòng: ${[...rooms].sort().join(', ')}`);

  for (const [field, value] of Object.entries(record.rationale ?? {})) {
    if (typeof value === 'string' && PRESET_CODE.test(value)) parts.push(`${field}: ${value}`);
  }

  return parts.join('. ');
}

/** Ô chữ tự do bị giữ lại — trả ra để giao diện nói thẳng cái gì không đi ra ngoài. */
export function withheldFields(rationale: RationalePayload | null | undefined): string[] {
  return Object.entries(rationale ?? {})
    .filter(([, value]) => typeof value === 'string' && value !== '' && !PRESET_CODE.test(value))
    .map(([field]) => field);
}
