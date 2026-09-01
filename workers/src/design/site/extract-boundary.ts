/**
 * Đọc ảnh trích lục/sổ đỏ ra ranh giới thửa đất — Gemini đọc CẤU TRÚC, một hàm thuần dựng đa
 * giác.
 *
 * Hai đường, ưu tiên theo thứ tự (xem `extractSiteBoundary`):
 *  1. Bảng toạ độ in sẵn trên ảnh (`vertex_coordinates`, khi có ≥3 điểm) →
 *     `polygonFromCoordinates` — chính xác tuyệt đối, Gemini chỉ CHÉP chữ số đã in.
 *  2. Hình vẽ sơ đồ (`edges`, chiều dài + góc quay ước lượng) → `polygonFromEdges` — dự phòng
 *     cho ảnh không có bảng toạ độ.
 * Cả hai đều từ `@nvg/shared/design`.
 *
 * Kết quả chỉ là dữ liệu NHÁP điền vào `site.boundary_m` của biểu mẫu Đầu bài — người dùng
 * xem lại/sửa/lưu như mọi trường khác. KHÔNG đúc artifact, KHÔNG cần Workflow: chỉ một lượt
 * gọi Gemini rồi một phép tính thuần, xong ngay trong một request.
 *
 * `dataClass` khai CỨNG = 2 ("mặt bằng kích thước thật") — xem doc-comment của
 * `extractSiteBoundary`.
 */

import {
  polygonFromCoordinates,
  polygonFromEdges,
  PolygonFromCoordinatesError,
  PolygonFromEdgesError,
  siteBoundaryExtractionEdgeSchema,
  siteBoundaryExtractionSchema,
  siteBoundaryExtractionVertexCoordinateSchema,
  siteBoundaryExtractionWarningSchema,
  type Point,
  type SiteBoundaryExtractionEdge,
  type VertexCoordinateSpec,
} from '@nvg/shared/design';
import { ContractError } from '../contracts';
import type { GeminiClient } from '../llm/gemini';

/** `schema_version` của `SiteBoundaryExtraction` — Worker tự gán, KHÔNG hỏi mô hình ngôn ngữ
 * (một chuỗi semver không phải thứ mô hình cần "đọc từ ảnh", hỏi nó chỉ thêm một cách để sai). */
const SCHEMA_VERSION = '1.0.0';

/**
 * Quá lệch so với một hình khép kín thì cảnh báo cho người dùng — ngưỡng chọn RỘNG RÃI vì
 * đây là gợi ý điền sẵn, không phải kiểm quy chuẩn: người dùng luôn sửa lại được từng đỉnh
 * trước khi lưu.
 */
const CLOSURE_WARN_M = 0.3;
const CLOSURE_WARN_DEG = 10;

export interface ExtractSiteBoundaryInput {
  mimeType: string;
  bytes: Uint8Array;
}

export interface ExtractSiteBoundaryResult {
  boundaryM: Point[];
  edges: SiteBoundaryExtractionEdge[];
  assumedAngleIndices: number[];
  closureErrorM: number;
  closureErrorDeg: number;
  closedShapeConfidence: 'high' | 'medium' | 'low';
  warnings: { code: string; detail: string }[];
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    frontage_edge_index: { type: 'integer', nullable: true },
    edges: {
      // Cố ý KHÔNG khai `minItems`/`maxItems` ở đây: mảng lồng object nhiều `enum` cộng giới
      // hạn độ dài khiến chế độ structured-output của Gemini báo lỗi 400 "too many states for
      // serving" (bộ giải mã ràng buộc phải liệt kê tổ hợp trạng thái quá lớn). Giới hạn 3–24
      // đỉnh vẫn được `siteBoundaryExtractionSchema` (Zod, sinh từ contracts/) kiểm lại ngay
      // sau khi nhận kết quả — không mất kiểm tra, chỉ chuyển chỗ kiểm.
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          label_raw: { type: 'string', nullable: true },
          length_m: { type: 'number' },
          length_source: { type: 'string', enum: ['labeled', 'scaled', 'estimated'] },
          turn_deg: { type: 'number', nullable: true },
          turn_source: {
            type: 'string',
            enum: ['labeled', 'right_angle_assumed', 'estimated', 'unknown'],
          },
          boundary_label: { type: 'string', nullable: true },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: [
          'index',
          'label_raw',
          'length_m',
          'length_source',
          'turn_deg',
          'turn_source',
          'boundary_label',
          'confidence',
        ],
      },
    },
    // Bảng toạ độ in sẵn (nếu ảnh có) — chỉ CHÉP số, không tính toán. Cũng cố ý không khai
    // minItems/maxItems ở đây cùng lý do với `edges` ở trên, dù object này không có enum nên
    // rủi ro thấp hơn — giữ nhất quán, tránh phải chẩn đoán lại lỗi 400 khi ảnh có nhiều đỉnh.
    vertex_coordinates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          label_raw: { type: 'string', nullable: true },
          x: { type: 'number' },
          y: { type: 'number' },
        },
        required: ['index', 'label_raw', 'x', 'y'],
      },
    },
    closed_shape_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { code: { type: 'string' }, detail: { type: 'string' } },
        required: ['code', 'detail'],
      },
    },
    notes: { type: 'string', nullable: true },
  },
  required: [
    'frontage_edge_index',
    'edges',
    'vertex_coordinates',
    'closed_shape_confidence',
    'warnings',
    'notes',
  ],
};

const SYSTEM_PROMPT = [
  'Vai trò: đọc ảnh trích lục địa chính / sổ đỏ / bản vẽ tay của một thửa đất.',
  'Ảnh có thể mang HAI nguồn thông tin khác nhau — kiểm tra cả hai, độc lập với nhau:',
  '',
  '=== NGUỒN 1 — BẢNG TOẠ ĐỘ (vertex_coordinates) — ưu tiên tuyệt đối khi có ===',
  'Nhiều trích lục/sổ đỏ có kèm một bảng số liệu riêng, thường ghi tiêu đề như "BẢNG KÊ TOẠ ĐỘ",',
  '"BẢNG KÊ GÓC THỬA" hoặc tương đương, với các cột "Số hiệu góc thửa"/"Điểm", "X", "Y" (có thể',
  'kèm cột khoảng cách/S — BỎ QUA cột đó, không cần dùng).',
  'Nếu ảnh CÓ bảng này: CHÉP NGUYÊN VĂN từng số vào vertex_coordinates, đúng thứ tự hàng trong',
  'bảng (đó chính là chiều đi quanh ranh giới) — index lấy từ "Số hiệu góc thửa", x/y lấy đúng',
  'số đã in, KHÔNG làm tròn, KHÔNG trừ/cộng, KHÔNG tự tính khoảng cách hay góc từ hai số này.',
  'Đây là việc ĐỌC CHỮ SỐ đã in, không phải suy luận — số liệu đo đạc thật, chính xác hơn hẳn so',
  'với việc ước lượng bằng mắt trên hình vẽ sơ đồ (thường không đúng tỷ lệ dù có ghi "Tỷ lệ").',
  'Nếu hàng cuối bảng lặp lại đúng hàng đầu (khép vòng), vẫn chép đủ — lớp gọi tự loại đỉnh',
  'trùng.',
  'Nếu ảnh KHÔNG có bảng toạ độ, trả vertex_coordinates là mảng rỗng.',
  '',
  '=== NGUỒN 2 — HÌNH VẼ SƠ ĐỒ (edges) — luôn phải điền, kể cả khi đã có Nguồn 1 ===',
  'Đọc số ghi trên hình vẽ sơ đồ (chiều dài cạnh, ghi chú giáp ranh) để điền edges — dùng để',
  'đối chiếu và cho trường hợp ảnh KHÔNG có bảng toạ độ.',
  'KHÔNG trả toạ độ ở đây, KHÔNG tự tính diện tích — chỉ đọc và ước lượng từng cạnh.',
  'Đánh số cạnh liên tục theo MỘT chiều duy nhất quanh ranh giới, bắt đầu từ cạnh giáp đường/lộ giới nếu nhận ra được.',
  'Với mỗi cạnh: chép NGUYÊN VĂN số đo ghi trên ảnh vào label_raw (kể cả khi viết tay khó đọc), rồi quy đổi ra mét ở length_m.',
  'length_source: "labeled" nếu có số ghi rõ trên ảnh; "scaled" nếu suy từ thước tỷ lệ vẽ trên ảnh; "estimated" nếu không có căn cứ số nào.',
  'turn_deg là góc quay NGOÀI sang cạnh kế tiếp (dương = quay trái). Chỉ điền số khi ảnh THẬT SỰ có ghi hoặc vẽ rõ ràng là góc vuông — còn lại để null, đừng đoán một con số cụ thể.',
  'turn_source: "labeled" nếu có số đo góc; "right_angle_assumed" nếu ảnh vẽ như góc vuông nhưng không ghi số; "estimated" nếu ước lượng từ hình vẽ tay không theo tỷ lệ; "unknown" khi turn_deg là null.',
  'boundary_label ghi nguyên văn chữ giáp ranh trên ảnh cho cạnh đó, nếu có (ví dụ "giáp hẻm 2m", "giáp đất ông A").',
  'confidence của từng cạnh phản ánh mức tin cậy của RIÊNG cạnh đó — không tô hồng khi ảnh mờ hoặc chữ khó đọc.',
  '',
  'closed_shape_confidence đánh giá tổng thể việc ranh giới có khép kín thành một hình hay không.',
  'warnings ghi các vấn đề mức tài liệu: ảnh mờ, cắt xén, thiếu góc, chữ viết tay khó đọc…',
].join('\n');

/**
 * Mã hoá base64 theo TỪNG MẢNH nhỏ.
 *
 * `btoa(String.fromCharCode(...bytes))` tràn ngăn xếp với ảnh vài megabyte trở lên — số đối
 * số truyền vào `fromCharCode` bị JavaScript giới hạn. Ảnh sổ đỏ chụp bằng điện thoại thường
 * vượt ngưỡng đó dễ dàng.
 */
function base64Encode(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Đọc `vertex_coordinates` KHOAN DUNG — kiểm TỪNG ĐIỂM độc lập, bỏ qua điểm hỏng thay vì làm
 * hỏng cả mảng. Lý do tách khỏi `siteBoundaryExtractionSchema.safeParse` chung: khi ảnh có bảng
 * toạ độ, mảng này một mình đã đủ dựng ranh giới chính xác — không được để một lỗi ở CHỖ KHÁC
 * của payload (thường gặp: Gemini điền `edges` bằng số giữ chỗ như `length_m: 0` vì coi đó là
 * phụ) làm mất một kết quả vốn đã tốt.
 */
function readVertexCoordinates(value: unknown): VertexCoordinateSpec[] {
  if (!Array.isArray(value)) return [];
  const out: VertexCoordinateSpec[] = [];
  for (const item of value) {
    const parsed = siteBoundaryExtractionVertexCoordinateSchema.safeParse(item);
    if (parsed.success) out.push({ index: parsed.data.index, x: parsed.data.x, y: parsed.data.y });
  }
  return out;
}

/** Cùng lý lẽ với `readVertexCoordinates` — khoan dung theo từng phần tử. */
function readEdgesLenient(value: unknown): SiteBoundaryExtractionEdge[] {
  if (!Array.isArray(value)) return [];
  const out: SiteBoundaryExtractionEdge[] = [];
  for (const item of value) {
    const parsed = siteBoundaryExtractionEdgeSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function readClosedShapeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'high';
}

function readWarningsLenient(value: unknown): { code: string; detail: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { code: string; detail: string }[] = [];
  for (const item of value) {
    const parsed = siteBoundaryExtractionWarningSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Đọc một ảnh trích lục/sổ đỏ, trả về ranh giới thửa đất đã dựng.
 *
 * ## `dataClass = 2`, khai CỨNG — không nhận từ tham số hay từ client
 *
 * Ảnh trích lục/sổ đỏ của một dự án THẬT luôn là "mặt bằng kích thước thật" (hạng 2 theo
 * bảng phân loại đầu `config/models.yaml`) — không bao giờ là dữ liệu giả lập/ẩn danh. Với
 * `max_data_class: 3` hiện đặt cho MỌI route (quyết định T8, CLAUDE.md 8.5), lời gọi này
 * LUÔN bị `DataClassViolation` chặn cho tới khi Haan tự hạ số đó khi có cam kết bằng văn bản
 * của nhà cung cấp — đây là hành vi ĐÚNG kiến trúc, không phải lỗi. Không thêm tham số cho
 * phép nhận `dataClass` từ nơi gọi: có tham số đó là có đường vòng qua lớp chặn.
 */
export async function extractSiteBoundary(
  llm: GeminiClient,
  input: ExtractSiteBoundaryInput,
): Promise<ExtractSiteBoundaryResult> {
  const dataBase64 = base64Encode(input.bytes);

  const raw = await llm.generateJson<Record<string, unknown>>('site_boundary_extract', 2, {
    system: SYSTEM_PROMPT,
    prompt: 'Đọc ảnh đính kèm và trả về danh sách cạnh theo đúng lược đồ đã cho.',
    schema: RESPONSE_SCHEMA,
    images: [{ mimeType: input.mimeType, dataBase64 }],
  });

  const vertexCoordinates = readVertexCoordinates(raw.vertex_coordinates);

  let built;
  let edgesForResult: SiteBoundaryExtractionEdge[];
  let closedShapeConfidence: 'high' | 'medium' | 'low';
  let warningsFromModel: { code: string; detail: string }[];

  if (vertexCoordinates.length >= 3) {
    try {
      built = polygonFromCoordinates(vertexCoordinates);
    } catch (error) {
      if (error instanceof PolygonFromCoordinatesError) throw error;
      throw new PolygonFromCoordinatesError('Không dựng được ranh giới từ bảng toạ độ đã đọc.');
    }
    edgesForResult = readEdgesLenient(raw.edges);
    closedShapeConfidence = readClosedShapeConfidence(raw.closed_shape_confidence);
    warningsFromModel = readWarningsLenient(raw.warnings);
  } else {
    // Không đủ toạ độ để tự đứng — đây là đường DUY NHẤT còn lại nên phải kiểm CHẶT như cũ:
    // `edges` bắt buộc hợp lệ, không khoan dung.
    const parsed = siteBoundaryExtractionSchema.safeParse({
      ...raw,
      schema_version: SCHEMA_VERSION,
    });
    if (!parsed.success) {
      throw new ContractError('site_boundary_extraction', parsed.error.issues);
    }
    const extraction = parsed.data;
    try {
      built = polygonFromEdges(
        extraction.edges.map((e) => ({ lengthM: e.length_m, turnDeg: e.turn_deg })),
      );
    } catch (error) {
      if (error instanceof PolygonFromEdgesError) throw error;
      throw new PolygonFromEdgesError('Không dựng được ranh giới từ các cạnh đã đọc.');
    }
    edgesForResult = extraction.edges;
    closedShapeConfidence = extraction.closed_shape_confidence;
    warningsFromModel = extraction.warnings ?? [];
  }

  const warnings = [...warningsFromModel];
  if (built.closureErrorM > CLOSURE_WARN_M || built.closureErrorDeg > CLOSURE_WARN_DEG) {
    warnings.push({
      code: 'boundary_not_closed',
      detail: `Các cạnh đọc được không khép kín thành hình kín — lệch khoảng ${built.closureErrorM.toFixed(2)} m và ${built.closureErrorDeg.toFixed(1)}°. Kiểm tra lại số đo và góc trước khi lưu.`,
    });
  }
  if (built.assumedAngleIndices.length > 0) {
    warnings.push({
      code: 'angles_assumed',
      detail: `${built.assumedAngleIndices.length} cạnh không đọc được góc, hệ thống chia đều phần góc còn thiếu — kiểm tra lại các đỉnh liên quan.`,
    });
  }

  return {
    boundaryM: built.boundaryM,
    edges: edgesForResult,
    assumedAngleIndices: built.assumedAngleIndices,
    closureErrorM: built.closureErrorM,
    closureErrorDeg: built.closureErrorDeg,
    closedShapeConfidence,
    warnings,
  };
}
