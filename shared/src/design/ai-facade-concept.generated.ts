/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-facade-concept.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFacadeConceptSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFacadeConceptSemver = z.infer<typeof aiFacadeConceptSemverSchema>;

export const aiFacadeConceptArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFacadeConceptArtifactRef = z.infer<typeof aiFacadeConceptArtifactRefSchema>;

export const aiFacadeConceptCodeSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/);

export type AiFacadeConceptCode = z.infer<typeof aiFacadeConceptCodeSchema>;

export const aiFacadeConceptHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export type AiFacadeConceptHex = z.infer<typeof aiFacadeConceptHexSchema>;

/** Xăng-ti-mét, lưới nửa centimet. */
export const aiFacadeConceptCmSchema = z
  .number()
  .multipleOf(0.5)
  .describe('Xăng-ti-mét, lưới nửa centimet.');

export type AiFacadeConceptCm = z.infer<typeof aiFacadeConceptCmSchema>;

export const aiFacadeConceptCodeOrNullSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/)
  .nullable();

export type AiFacadeConceptCodeOrNull = z.infer<typeof aiFacadeConceptCodeOrNullSchema>;

/**
 * Ý tưởng mặt đứng của NHÁNH AI — bước trung gian giữa mặt bằng và bộ ảnh phối cảnh (T16, 09/09/2026).
 *
 * Vì sao cần bước này. Đầu bài KHÔNG có trường nào về mái, vật liệu, màu, cổng hay ban công — đo ngày 09/09: cả hợp đồng `design-brief` chỉ có `style` (một trong chín) và một ô ghi chú tự do. Đưa thẳng chừng đó cho mô hình ảnh thì năm tấm ảnh ra năm ngôi nhà khác nhau. Ở đây mô hình phải NÓI RA nó định làm mặt đứng thế nào, kiến trúc sư sửa được, rồi mới trả tiền dựng ảnh.
 *
 * Ranh giới: mô hình chỉ TRANG TRÍ. `openings_front` do Worker suy từ chính tường bao mặt trước của mặt bằng và là dữ liệu KHOÁ — mô hình không được dời, thêm hay bớt cửa sổ. Muốn đổi lỗ mở thì sửa mặt bằng rồi chạy lại. Nhờ ràng buộc đó, mặt bằng, mặt đứng và ảnh nói cùng một chuyện.
 *
 * Mã vật liệu, mái, cổng, lan can lấy từ kb/facade_vocabulary.yaml — mỗi mã có nhãn tiếng Việt cho giao diện và một cụm tiếng Anh để ghép vào lời dẫn ảnh. Quy ước là dữ liệu, không viết vào mã nguồn.
 *
 * Đơn vị: xăng-ti-mét, lưới nửa centimet, như `ai-floor-plan`. Toạ độ trong `elevation` là hệ hai chiều của mặt đứng: `x` chạy ngang mặt tiền (cùng gốc với `x` của mặt bằng), `z` là cao độ tính từ mặt sàn hoàn thiện tầng 1 = ±0.000 (quy ước hồ sơ NVG, HS-01); cốt vỉa hè nằm ở `elevation.ground_z`, thường âm.
 *
 * Phần mô hình khai nằm ở hợp đồng riêng `ai-facade-proposal`; Worker ghép nó với khung suy từ mặt bằng thành artifact này (T59).
 */
export const aiFacadeConceptSchema = z
  .object({
    schema_version: aiFacadeConceptSemverSchema,
    /** Mặt bằng (`ai_floor_plan`) mà mặt đứng này dựng theo. Worker điền. */
    plan_ref: aiFacadeConceptArtifactRefSchema.describe(
      'Mặt bằng (`ai_floor_plan`) mà mặt đứng này dựng theo. Worker điền.',
    ),
    /** Phiếu yêu cầu mặt đứng của kỹ sư (`ai_facade_brief`) mà ý tưởng này theo. Rỗng khi kỹ sư chưa điền phiếu. Worker điền. */
    brief_ref: aiFacadeConceptArtifactRefSchema
      .nullable()
      .describe(
        'Phiếu yêu cầu mặt đứng của kỹ sư (`ai_facade_brief`) mà ý tưởng này theo. Rỗng khi kỹ sư chưa điền phiếu. Worker điền.',
      )
      .optional(),
    /** Phong cách, cùng bộ mã với đầu bài. */
    style: z
      .enum([
        'hien_dai',
        'tan_co_dien',
        'indochine',
        'mai_thai',
        'toi_gian',
        'nhiet_doi',
        'dia_trung_hai',
        'co_dien',
        'bac_au',
      ])
      .describe('Phong cách, cùng bộ mã với đầu bài.'),
    roof: z
      .object({
        /** flat = mái bằng · hip = mái tứ giác · gable = mái hai dốc · thai = mái Thái · japanese = mái Nhật · mansard = mái mansard · mixed = hỗn hợp. */
        type: z
          .enum(['flat', 'hip', 'gable', 'thai', 'japanese', 'mansard', 'mixed'])
          .describe(
            'flat = mái bằng · hip = mái tứ giác · gable = mái hai dốc · thai = mái Thái · japanese = mái Nhật · mansard = mái mansard · mixed = hỗn hợp.',
          ),
        /** Độ dốc mái, độ. Rỗng với mái bằng. */
        pitch_deg: z
          .number()
          .gte(0)
          .lte(60)
          .nullable()
          .describe('Độ dốc mái, độ. Rỗng với mái bằng.')
          .optional(),
        material: aiFacadeConceptCodeSchema,
        colour: aiFacadeConceptCodeSchema,
      })
      .strict(),
    materials: z
      .array(
        z
          .object({
            /** base = phần đế · body = thân nhà · accent = mảng nhấn · trim = chỉ, phào, khung · railing = lan can · gate = cổng · fence = tường rào · main_door = cửa chính · side_door = cửa phụ, cửa ra ban công · window = khung cửa sổ · garage_door = cửa để xe. */
            where: z
              .enum([
                'base',
                'body',
                'accent',
                'trim',
                'railing',
                'gate',
                'fence',
                'main_door',
                'side_door',
                'window',
                'garage_door',
              ])
              .describe(
                'base = phần đế · body = thân nhà · accent = mảng nhấn · trim = chỉ, phào, khung · railing = lan can · gate = cổng · fence = tường rào · main_door = cửa chính · side_door = cửa phụ, cửa ra ban công · window = khung cửa sổ · garage_door = cửa để xe.',
              ),
            material: aiFacadeConceptCodeSchema,
            colour: aiFacadeConceptCodeSchema,
            finish: z.string().max(60).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    /** Ba màu chủ đạo dạng mã hex — để giao diện hiện ô màu sửa được, và để lời dẫn ảnh nói màu chính xác thay vì «be nhạt». */
    palette: z
      .object({
        primary_hex: aiFacadeConceptHexSchema,
        secondary_hex: aiFacadeConceptHexSchema,
        accent_hex: aiFacadeConceptHexSchema.nullable().optional(),
      })
      .strict()
      .describe(
        'Ba màu chủ đạo dạng mã hex — để giao diện hiện ô màu sửa được, và để lời dẫn ảnh nói màu chính xác thay vì «be nhạt».',
      ),
    gate: z
      .object({
        type: z.enum(['swing', 'sliding', 'folding', 'none']),
        w: aiFacadeConceptCmSchema.optional(),
        h: aiFacadeConceptCmSchema.optional(),
        material: aiFacadeConceptCodeSchema.nullable().optional(),
        colour: aiFacadeConceptCodeSchema.nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    fence: z
      .object({
        h: aiFacadeConceptCmSchema,
        material: aiFacadeConceptCodeSchema.nullable().optional(),
        colour: aiFacadeConceptCodeSchema.nullable().optional(),
        /** Kiểu tường rào, mã nhóm `fence_types`. */
        type: aiFacadeConceptCodeSchema
          .nullable()
          .describe('Kiểu tường rào, mã nhóm `fence_types`.')
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    /** Ban công, sân thượng nhìn từ mặt trước — WORKER SUY từ lan can (`walls[].k = r`) của mặt bằng; mô hình chỉ chọn kiểu lan can. `depth` = 0 khi ban công nằm trong hình bao (phần đua ra là Q-46, chưa làm). */
    balconies: z
      .array(
        z
          .object({
            level: z.number().int().gte(1),
            x0: aiFacadeConceptCmSchema,
            x1: aiFacadeConceptCmSchema,
            /** Độ vươn ra khỏi mặt tường, cm. */
            depth: aiFacadeConceptCmSchema.describe('Độ vươn ra khỏi mặt tường, cm.'),
            railing: aiFacadeConceptCodeSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(24)
      .describe(
        'Ban công, sân thượng nhìn từ mặt trước — WORKER SUY từ lan can (`walls[].k = r`) của mặt bằng; mô hình chỉ chọn kiểu lan can. `depth` = 0 khi ban công nằm trong hình bao (phần đua ra là Q-46, chưa làm).',
      )
      .optional(),
    /** Lỗ mở trên mặt tiền — WORKER SUY từ cửa và cửa sổ nằm trên tường bao mặt trước của mặt bằng. Dữ liệu KHOÁ: mô hình nhận để vẽ cho đúng, không được sửa. Đây là thứ buộc mặt đứng khớp mặt bằng. */
    openings_front: z
      .array(
        z
          .object({
            level: z.number().int().gte(1),
            /** Mép TRÁI của lỗ mở nhìn từ đường, cùng gốc với `x` của mặt bằng. */
            x: aiFacadeConceptCmSchema.describe(
              'Mép TRÁI của lỗ mở nhìn từ đường, cùng gốc với `x` của mặt bằng.',
            ),
            w: aiFacadeConceptCmSchema,
            /** Cao độ bệ so với sàn tầng đó, cm. */
            sill: aiFacadeConceptCmSchema.describe('Cao độ bệ so với sàn tầng đó, cm.'),
            h: aiFacadeConceptCmSchema,
            kind: z.enum(['door', 'window', 'garage', 'gate', 'opening']),
          })
          .strict(),
      )
      .max(80)
      .describe(
        'Lỗ mở trên mặt tiền — WORKER SUY từ cửa và cửa sổ nằm trên tường bao mặt trước của mặt bằng. Dữ liệu KHOÁ: mô hình nhận để vẽ cho đúng, không được sửa. Đây là thứ buộc mặt đứng khớp mặt bằng.',
      ),
    /** Kiểu cửa lấy từ phiếu yêu cầu — dữ liệu KHOÁ như `openings_front`, mô hình không khai. Mã trong kb/facade_vocabulary.yaml; rỗng = chưa chọn, bộ vẽ theo quy tắc bề rộng. */
    openings_style: z
      .object({
        main_door_type: aiFacadeConceptCodeOrNullSchema,
        side_door_type: aiFacadeConceptCodeOrNullSchema,
        glass: aiFacadeConceptCodeOrNullSchema,
        garage_door_type: aiFacadeConceptCodeOrNullSchema,
      })
      .strict()
      .nullable()
      .describe(
        'Kiểu cửa lấy từ phiếu yêu cầu — dữ liệu KHOÁ như `openings_front`, mô hình không khai. Mã trong kb/facade_vocabulary.yaml; rỗng = chưa chọn, bộ vẽ theo quy tắc bề rộng.',
      )
      .optional(),
    /** Dữ liệu vẽ tờ mặt đứng. Khung (bề rộng, cao độ từng tầng) do Worker suy từ mặt bằng; mô hình thêm đường mái và các mảng trang trí. */
    elevation: z
      .object({
        /** Mặt đang vẽ. Giai đoạn 1 chỉ mặt trước; enum một giá trị là chỗ nối cho mặt bên và mặt sau ở giai đoạn 2. */
        face: z
          .enum(['front'])
          .describe(
            'Mặt đang vẽ. Giai đoạn 1 chỉ mặt trước; enum một giá trị là chỗ nối cho mặt bên và mặt sau ở giai đoạn 2.',
          ),
        /** Bề rộng mặt tiền, cm. */
        width: aiFacadeConceptCmSchema.describe('Bề rộng mặt tiền, cm.'),
        /** Cốt vỉa hè so với ±0.000 (mặt sàn tầng 1), cm. Worker lấy từ kb/construction_norms.yaml. */
        ground_z: aiFacadeConceptCmSchema.describe(
          'Cốt vỉa hè so với ±0.000 (mặt sàn tầng 1), cm. Worker lấy từ kb/construction_norms.yaml.',
        ),
        levels: z
          .array(
            z
              .object({
                level: z.number().int().gte(1),
                /** Cao độ mặt sàn hoàn thiện so với ±0.000 (sàn tầng 1), cm. */
                z: aiFacadeConceptCmSchema.describe(
                  'Cao độ mặt sàn hoàn thiện so với ±0.000 (sàn tầng 1), cm.',
                ),
                h: aiFacadeConceptCmSchema,
                /** Mép trái khối xây của tầng nhìn từ đường. */
                x0: aiFacadeConceptCmSchema.describe('Mép trái khối xây của tầng nhìn từ đường.'),
                /** Mép phải khối xây của tầng nhìn từ đường. */
                x1: aiFacadeConceptCmSchema.describe('Mép phải khối xây của tầng nhìn từ đường.'),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        /** Chiều cao tường chắn mái so với sàn mái, cm. Rỗng khi không có. */
        parapet: aiFacadeConceptCmSchema
          .nullable()
          .describe('Chiều cao tường chắn mái so với sàn mái, cm. Rỗng khi không có.')
          .optional(),
        /** Đường bao mái nhìn từ mặt trước, các điểm [x, z] nối liên tiếp. Worker dựng từ `roof.type` + `roof.pitch_deg` khi mô hình không khai; khai thì Worker kiểm nằm trong khung. */
        roof_outline: z
          .array(z.array(aiFacadeConceptCmSchema).min(2).max(2))
          .max(24)
          .describe(
            'Đường bao mái nhìn từ mặt trước, các điểm [x, z] nối liên tiếp. Worker dựng từ `roof.type` + `roof.pitch_deg` khi mô hình không khai; khai thì Worker kiểm nằm trong khung.',
          )
          .optional(),
        /** Mảng trang trí trên mặt đứng: ô văng, cột, mảng ốp, lam, bồn cây. Không phải lỗ mở. */
        elements: z
          .array(
            z
              .object({
                kind: z.enum([
                  'canopy',
                  'column',
                  'cladding',
                  'louvre',
                  'planter',
                  'cornice',
                  'eaves_band',
                  'finial',
                  'reveal',
                ]),
                /** [x0, z0, x1, z1] cm. */
                rect: z
                  .array(aiFacadeConceptCmSchema)
                  .min(4)
                  .max(4)
                  .describe('[x0, z0, x1, z1] cm.'),
                /** Chỉ số trong mảng `materials`. Rỗng thì lấy vật liệu của thân nhà. */
                material_ref: z
                  .number()
                  .int()
                  .gte(0)
                  .nullable()
                  .describe('Chỉ số trong mảng `materials`. Rỗng thì lấy vật liệu của thân nhà.')
                  .optional(),
              })
              .strict(),
          )
          .max(40)
          .describe(
            'Mảng trang trí trên mặt đứng: ô văng, cột, mảng ốp, lam, bồn cây. Không phải lỗ mở.',
          )
          .optional(),
      })
      .strict()
      .describe(
        'Dữ liệu vẽ tờ mặt đứng. Khung (bề rộng, cao độ từng tầng) do Worker suy từ mặt bằng; mô hình thêm đường mái và các mảng trang trí.',
      ),
    rationale: z.string().max(1500),
    generator: z
      .object({
        kind: z.enum(['ai']),
        provider: z.string().max(32),
        model: z.string().max(96),
        route: z.string().max(64),
        prompt_version: z.string().max(16),
        repaired: z.boolean().optional(),
        /** Kiến trúc sư đã sửa ý tưởng này. Bản sửa là artifact MỚI (artifact bất biến), nối lineage bằng bước `ai_facade_edit`. */
        edited_by_user: z
          .boolean()
          .describe(
            'Kiến trúc sư đã sửa ý tưởng này. Bản sửa là artifact MỚI (artifact bất biến), nối lineage bằng bước `ai_facade_edit`.',
          )
          .optional(),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Ý tưởng mặt đứng của NHÁNH AI — bước trung gian giữa mặt bằng và bộ ảnh phối cảnh (T16, 09/09/2026).\n\nVì sao cần bước này. Đầu bài KHÔNG có trường nào về mái, vật liệu, màu, cổng hay ban công — đo ngày 09/09: cả hợp đồng `design-brief` chỉ có `style` (một trong chín) và một ô ghi chú tự do. Đưa thẳng chừng đó cho mô hình ảnh thì năm tấm ảnh ra năm ngôi nhà khác nhau. Ở đây mô hình phải NÓI RA nó định làm mặt đứng thế nào, kiến trúc sư sửa được, rồi mới trả tiền dựng ảnh.\n\nRanh giới: mô hình chỉ TRANG TRÍ. `openings_front` do Worker suy từ chính tường bao mặt trước của mặt bằng và là dữ liệu KHOÁ — mô hình không được dời, thêm hay bớt cửa sổ. Muốn đổi lỗ mở thì sửa mặt bằng rồi chạy lại. Nhờ ràng buộc đó, mặt bằng, mặt đứng và ảnh nói cùng một chuyện.\n\nMã vật liệu, mái, cổng, lan can lấy từ kb/facade_vocabulary.yaml — mỗi mã có nhãn tiếng Việt cho giao diện và một cụm tiếng Anh để ghép vào lời dẫn ảnh. Quy ước là dữ liệu, không viết vào mã nguồn.\n\nĐơn vị: xăng-ti-mét, lưới nửa centimet, như `ai-floor-plan`. Toạ độ trong `elevation` là hệ hai chiều của mặt đứng: `x` chạy ngang mặt tiền (cùng gốc với `x` của mặt bằng), `z` là cao độ tính từ mặt sàn hoàn thiện tầng 1 = ±0.000 (quy ước hồ sơ NVG, HS-01); cốt vỉa hè nằm ở `elevation.ground_z`, thường âm.\n\nPhần mô hình khai nằm ở hợp đồng riêng `ai-facade-proposal`; Worker ghép nó với khung suy từ mặt bằng thành artifact này (T59).',
  );

export type AiFacadeConcept = z.infer<typeof aiFacadeConceptSchema>;
