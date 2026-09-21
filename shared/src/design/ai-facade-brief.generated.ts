/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-facade-brief.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFacadeBriefSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFacadeBriefSemver = z.infer<typeof aiFacadeBriefSemverSchema>;

export const aiFacadeBriefArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFacadeBriefArtifactRef = z.infer<typeof aiFacadeBriefArtifactRefSchema>;

export const aiFacadeBriefCodeOrNullSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/)
  .nullable();

export type AiFacadeBriefCodeOrNull = z.infer<typeof aiFacadeBriefCodeOrNullSchema>;

export const aiFacadeBriefFinishSchema = z
  .object({
    material: aiFacadeBriefCodeOrNullSchema,
    colour: aiFacadeBriefCodeOrNullSchema,
  })
  .strict();

export type AiFacadeBriefFinish = z.infer<typeof aiFacadeBriefFinishSchema>;

export const aiFacadeBriefDoorSchema = z
  .object({
    material: aiFacadeBriefCodeOrNullSchema,
    colour: aiFacadeBriefCodeOrNullSchema,
    /** Kiểu mở, mã trong nhóm `door_types`. */
    type: aiFacadeBriefCodeOrNullSchema.describe('Kiểu mở, mã trong nhóm `door_types`.'),
    /** Chiều cao lọt lòng. Bề rộng lấy từ mặt bằng. */
    h_cm: z
      .number()
      .int()
      .gte(150)
      .lte(600)
      .nullable()
      .describe('Chiều cao lọt lòng. Bề rộng lấy từ mặt bằng.'),
  })
  .strict();

export type AiFacadeBriefDoor = z.infer<typeof aiFacadeBriefDoorSchema>;

/**
 * Phiếu yêu cầu mặt đứng do KỸ SƯ điền trên màn hình bước Mặt đứng (T59, 19/09/2026 — Haan: «thêm tính năng khảo sát riêng cho phần này … để kỹ sư điền yêu cầu vào»).
 *
 * Mục nào có giá trị là yêu cầu BẮT BUỘC: chương trình áp thẳng vào ý tưởng mặt đứng (`ai/facade/merge.ts`), không trông vào việc mô hình nhớ làm theo. Mục `null` nghĩa là «để AI đề xuất». Mã vật liệu, màu, kiểu cửa… lấy từ `kb/facade_vocabulary.yaml`; Worker kiểm mã có trong danh mục lúc lưu.
 *
 * Kích thước cửa: chỉ có CHIỀU CAO. Bề rộng là của mặt bằng (lỗ mở KHOÁ, T16) — muốn đổi thì sửa mặt bằng.
 *
 * Đơn vị: xăng-ti-mét nguyên, độ.
 */
export const aiFacadeBriefSchema = z
  .object({
    schema_version: aiFacadeBriefSemverSchema,
    /**
     * Thời điểm máy chủ nhận phiếu, ISO 8601. Máy chủ đặt, không tin trình duyệt. Có hai việc: màn hình ghi «Đã lưu lúc …», và hai hồ sơ khác nhau cùng điền một phiếu giống hệt vẫn ra hai artifact khác nhau — mã artifact là băm NỘI DUNG, trùng nội dung là trùng mã (xem `ArtifactRepository.write`).
     *
     * CỐ Ý KHÔNG bắt buộc: phiếu lưu trước ngày 20/09/2026 không có khoá này, mà artifact là BẤT BIẾN — thêm một mục bắt buộc vào hợp đồng đã dùng là biến những thứ đã ghi thành không đọc nổi (đã xảy ra: màn hình Mặt đứng báo «saved_at — Required»). Máy chủ luôn đặt khoá này khi ghi, nên phiếu mới luôn có.
     */
    saved_at: z
      .string()
      .datetime({ offset: true })
      .describe(
        'Thời điểm máy chủ nhận phiếu, ISO 8601. Máy chủ đặt, không tin trình duyệt. Có hai việc: màn hình ghi «Đã lưu lúc …», và hai hồ sơ khác nhau cùng điền một phiếu giống hệt vẫn ra hai artifact khác nhau — mã artifact là băm NỘI DUNG, trùng nội dung là trùng mã (xem `ArtifactRepository.write`).\n\nCỐ Ý KHÔNG bắt buộc: phiếu lưu trước ngày 20/09/2026 không có khoá này, mà artifact là BẤT BIẾN — thêm một mục bắt buộc vào hợp đồng đã dùng là biến những thứ đã ghi thành không đọc nổi (đã xảy ra: màn hình Mặt đứng báo «saved_at — Required»). Máy chủ luôn đặt khoá này khi ghi, nên phiếu mới luôn có.',
      )
      .optional(),
    /** Phương án mặt bằng đang hiệu lực lúc lưu phiếu — để màn hình nhắc khi kỹ sư đã đổi phương án. */
    plan_ref: aiFacadeBriefArtifactRefSchema
      .nullable()
      .describe(
        'Phương án mặt bằng đang hiệu lực lúc lưu phiếu — để màn hình nhắc khi kỹ sư đã đổi phương án.',
      ),
    style: z
      .union([
        z.literal('hien_dai'),
        z.literal('tan_co_dien'),
        z.literal('indochine'),
        z.literal('mai_thai'),
        z.literal('toi_gian'),
        z.literal('nhiet_doi'),
        z.literal('dia_trung_hai'),
        z.literal('co_dien'),
        z.literal('bac_au'),
        z.literal(null),
      ])
      .nullable(),
    /** Cốt sàn tầng 1 cao hơn vỉa hè bao nhiêu. Rỗng thì lấy mặc định của kb/construction_norms.yaml. */
    ground_raise_cm: z
      .number()
      .int()
      .gte(0)
      .lte(300)
      .nullable()
      .describe(
        'Cốt sàn tầng 1 cao hơn vỉa hè bao nhiêu. Rỗng thì lấy mặc định của kb/construction_norms.yaml.',
      ),
    roof: z
      .object({
        type: z
          .union([
            z.literal('flat'),
            z.literal('hip'),
            z.literal('gable'),
            z.literal('thai'),
            z.literal('japanese'),
            z.literal('mansard'),
            z.literal('mixed'),
            z.literal(null),
          ])
          .nullable(),
        material: aiFacadeBriefCodeOrNullSchema,
        colour: aiFacadeBriefCodeOrNullSchema,
        pitch_deg: z.number().int().gte(0).lte(60).nullable(),
        parapet_cm: z.number().int().gte(0).lte(300).nullable(),
      })
      .strict(),
    /** Ba màu chủ đạo, mã trong nhóm `colours` của danh mục. */
    palette: z
      .object({
        primary: aiFacadeBriefCodeOrNullSchema,
        secondary: aiFacadeBriefCodeOrNullSchema,
        accent: aiFacadeBriefCodeOrNullSchema,
      })
      .strict()
      .describe('Ba màu chủ đạo, mã trong nhóm `colours` của danh mục.'),
    /** Vật liệu + màu từng vùng mặt tiền: thân nhà, phần đế, mảng nhấn, chỉ/phào/khung. */
    surfaces: z
      .object({
        body: aiFacadeBriefFinishSchema,
        base: aiFacadeBriefFinishSchema,
        accent: aiFacadeBriefFinishSchema,
        trim: aiFacadeBriefFinishSchema,
      })
      .strict()
      .describe('Vật liệu + màu từng vùng mặt tiền: thân nhà, phần đế, mảng nhấn, chỉ/phào/khung.'),
    main_door: aiFacadeBriefDoorSchema,
    side_door: aiFacadeBriefDoorSchema,
    window: z
      .object({
        material: aiFacadeBriefCodeOrNullSchema,
        colour: aiFacadeBriefCodeOrNullSchema,
        glass: aiFacadeBriefCodeOrNullSchema,
      })
      .strict(),
    garage_door: z
      .object({
        type: aiFacadeBriefCodeOrNullSchema,
        material: aiFacadeBriefCodeOrNullSchema,
        colour: aiFacadeBriefCodeOrNullSchema,
      })
      .strict(),
    /**
     * Lan can ban công. Chỉ hỏi khi phương án mặt bằng có ban công ra mặt trước.
     *
     * `material` và `h_cm` thêm ngày 20/09/2026 (Haan: «thêm 1 mục khảo sát cho lan can: vật liệu, chiều cao»). CỐ Ý KHÔNG bắt buộc: phiếu lưu trước ngày ấy không có hai khoá này, mà artifact là BẤT BIẾN — thêm một mục bắt buộc vào hợp đồng đã dùng là biến những thứ đã ghi thành không đọc nổi (đã xảy ra với `saved_at`).
     */
    balcony: z
      .object({
        /** Kiểu lan can, mã trong nhóm `railings`. */
        railing: aiFacadeBriefCodeOrNullSchema.describe('Kiểu lan can, mã trong nhóm `railings`.'),
        colour: aiFacadeBriefCodeOrNullSchema,
        /** Vật liệu lan can, mã trong nhóm `materials`. */
        material: aiFacadeBriefCodeOrNullSchema
          .describe('Vật liệu lan can, mã trong nhóm `materials`.')
          .optional(),
        /**
         * Chiều cao lan can tính từ mặt sàn ban công, cm. Rỗng thì chương trình dùng `kb/construction_norms.yaml` mục `outdoor.railing_h_m`.
         *
         * Số này KHÔNG đi qua mô hình: bộ vẽ đặt nó, và thước chấm đo đúng nó (tiêu chí R1, `do_ai: false`). Khoảng 60–160 là giới hạn DỰNG ĐƯỢC, không phải quy chuẩn — hồ sơ NVG đo được 80–90.
         */
        h_cm: z
          .number()
          .int()
          .gte(60)
          .lte(160)
          .nullable()
          .describe(
            'Chiều cao lan can tính từ mặt sàn ban công, cm. Rỗng thì chương trình dùng `kb/construction_norms.yaml` mục `outdoor.railing_h_m`.\n\nSố này KHÔNG đi qua mô hình: bộ vẽ đặt nó, và thước chấm đo đúng nó (tiêu chí R1, `do_ai: false`). Khoảng 60–160 là giới hạn DỰNG ĐƯỢC, không phải quy chuẩn — hồ sơ NVG đo được 80–90.',
          )
          .optional(),
      })
      .strict()
      .describe(
        'Lan can ban công. Chỉ hỏi khi phương án mặt bằng có ban công ra mặt trước.\n\n`material` và `h_cm` thêm ngày 20/09/2026 (Haan: «thêm 1 mục khảo sát cho lan can: vật liệu, chiều cao»). CỐ Ý KHÔNG bắt buộc: phiếu lưu trước ngày ấy không có hai khoá này, mà artifact là BẤT BIẾN — thêm một mục bắt buộc vào hợp đồng đã dùng là biến những thứ đã ghi thành không đọc nổi (đã xảy ra với `saved_at`).',
      ),
    /** Chỉ có nghĩa khi nhà có sân trước. */
    gate: z
      .object({
        /** true = có cổng, false = không làm cổng, null = để AI đề xuất. */
        wanted: z
          .boolean()
          .nullable()
          .describe('true = có cổng, false = không làm cổng, null = để AI đề xuất.'),
        type: z
          .union([z.literal('swing'), z.literal('sliding'), z.literal('folding'), z.literal(null)])
          .nullable(),
        material: aiFacadeBriefCodeOrNullSchema,
        colour: aiFacadeBriefCodeOrNullSchema,
        h_cm: z.number().int().gte(0).lte(1000).nullable(),
      })
      .strict()
      .describe('Chỉ có nghĩa khi nhà có sân trước.'),
    fence: z
      .object({
        type: aiFacadeBriefCodeOrNullSchema,
        material: aiFacadeBriefCodeOrNullSchema,
        colour: aiFacadeBriefCodeOrNullSchema,
        h_cm: z.number().int().gte(0).lte(1000).nullable(),
      })
      .strict(),
    /**
     * Chi tiết trang trí kỹ sư muốn có trên mặt tiền. Rỗng = để AI đề xuất.
     *
     * Trần bằng ĐÚNG số mã trong danh sách — tick hết mọi ô vẫn phải lưu được. Trần cũ là 6, đặt khi danh mục còn 9 mã: kỹ sư tick 7 ô thì phiếu bị từ chối bằng một câu chung chung, không nói ô nào (xảy ra thật 20/09/2026). Một phép thử canh hai con số này đi cùng `kb/facade_vocabulary.yaml`.
     */
    decorations: z
      .array(
        z.enum([
          'canopy',
          'column',
          'cladding',
          'louvre',
          'planter',
          'cornice',
          'eaves_band',
          'finial',
          'reveal',
          'arch',
          'oculus',
          'porch_roof',
        ]),
      )
      .max(12)
      .describe(
        'Chi tiết trang trí kỹ sư muốn có trên mặt tiền. Rỗng = để AI đề xuất.\n\nTrần bằng ĐÚNG số mã trong danh sách — tick hết mọi ô vẫn phải lưu được. Trần cũ là 6, đặt khi danh mục còn 9 mã: kỹ sư tick 7 ô thì phiếu bị từ chối bằng một câu chung chung, không nói ô nào (xảy ra thật 20/09/2026). Một phép thử canh hai con số này đi cùng `kb/facade_vocabulary.yaml`.',
      ),
    /** Ghi chú tự do của kỹ sư — gửi cho mô hình, nên màn hình nhắc không ghi danh tính khách. */
    notes: z
      .string()
      .max(1000)
      .nullable()
      .describe(
        'Ghi chú tự do của kỹ sư — gửi cho mô hình, nên màn hình nhắc không ghi danh tính khách.',
      ),
  })
  .strict()
  .describe(
    'Phiếu yêu cầu mặt đứng do KỸ SƯ điền trên màn hình bước Mặt đứng (T59, 19/09/2026 — Haan: «thêm tính năng khảo sát riêng cho phần này … để kỹ sư điền yêu cầu vào»).\n\nMục nào có giá trị là yêu cầu BẮT BUỘC: chương trình áp thẳng vào ý tưởng mặt đứng (`ai/facade/merge.ts`), không trông vào việc mô hình nhớ làm theo. Mục `null` nghĩa là «để AI đề xuất». Mã vật liệu, màu, kiểu cửa… lấy từ `kb/facade_vocabulary.yaml`; Worker kiểm mã có trong danh mục lúc lưu.\n\nKích thước cửa: chỉ có CHIỀU CAO. Bề rộng là của mặt bằng (lỗ mở KHOÁ, T16) — muốn đổi thì sửa mặt bằng.\n\nĐơn vị: xăng-ti-mét nguyên, độ.',
  );

export type AiFacadeBrief = z.infer<typeof aiFacadeBriefSchema>;
