/**
 * Chạy Lớp 2 một lượt: gom ba nguồn tri thức rồi gọi engine.
 *
 * Tách khỏi cả `workflows/design-pipeline.ts` lẫn `index.ts` vì CẢ HAI đều cần đúng chuỗi
 * việc này. Chép sang hai chỗ thì có ngày chương trình không gian sinh từ nút bấm khác với
 * chương trình sinh từ đường ống — cùng đầu bài, hai kết quả, và không ai biết bản nào đúng.
 *
 * Bản thân engine (`engine.ts`) vẫn là hàm thuần. Tệp này là phần KHÔNG thuần: đọc cấu hình
 * đã nhúng, hỏi CSDL, gọi mô hình ngôn ngữ. Ranh giới đó giữ cho engine kiểm thử được mà
 * không cần dựng CSDL hay mạng.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ROOM_LABEL,
  type DesignBrief,
  type ProgramIntent,
  type SpaceProgram,
} from '@nvg/shared/design';
import { fitAiAdditions } from './ai-additions';
import type { DesignEnv } from '../env';
import { roomVocabulary } from '../kb/vocabulary-data';
import { geminiClient } from '../llm/factory';
import { buildSpaceProgram, type PlateExplanation } from './engine';
import { plausibilityRules } from './plausibility-data';
import { resolveNeeds } from './needs';
import { spaceNorms } from './norms-data';
import { readRoomAreaPriors } from './priors';
import { rulePackFor } from '../rules/rule-pack-data';

export interface Layer2Run {
  payload: SpaceProgram;
  /** Các bước ra con số «sàn mỗi tầng» — hiện ở đầu màn hình Chương trình không gian. */
  plateExplanation: PlateExplanation;
  /** Điều engine phải nói ra nhưng không đủ để dừng lại. */
  warnings: string[];
  /** Đoạn chữ trong đầu bài chưa quy được về không gian nào. */
  unresolved: string[];
  /**
   * Đề xuất của AI ở Lớp 2a, viết ra để người đọc kiểm lại được.
   *
   * `null` khi mô hình không tham gia (chưa có khoá, hết hạn mức, trả sai cấu trúc). Đây là
   * thứ duy nhất nói cho kiến trúc sư biết vì sao bếp được ưu ái hơn kho — thiếu nó thì AI
   * tham gia mà không ai kiểm được, và "con người quyết định cuối cùng" (PRD 2.3) chỉ còn là
   * một câu trong tài liệu.
   */
  aiSuggestion: { rationale: string; generous: string[]; modest: string[] } | null;
  /**
   * Cấu hình đã dùng — băm thành `params_hash` của cạnh lineage.
   *
   * Phải chứa ĐỦ thứ quyết định đầu ra, nếu không "đã tính rồi thì không tính lại" sẽ trả về
   * kết quả cũ sau khi ai đó sửa chuẩn diện tích.
   */
  params: Record<string, unknown>;
}

export type SavedAiIntent = NonNullable<SpaceProgram['ai_intent']>;

/**
 * @param aiIntent Đề xuất mức ưu tiên của AI ĐÃ CÓ — do kiến trúc sư bấm nút lấy về, hoặc lưu
 *   kèm bản chốt. Tệp này KHÔNG gọi mô hình để lấy nó nữa (13/09/2026): mở màn hình không được
 *   là một khoản tiền. Vắng thì chương trình lập thuần theo chuẩn nghề.
 */
export async function runLayer2(
  env: DesignEnv,
  db: SupabaseClient,
  brief: DesignBrief,
  briefRef: string,
  tenantId: string,
  aiIntent: SavedAiIntent | null = null,
): Promise<Layer2Run> {
  const norms = spaceNorms();
  const rules = rulePackFor(brief.locality);

  // Nhu cầu riêng của từng nhóm thành viên tách làm hai đường, và ranh giới ở đây quan trọng:
  //
  //  · Biểu mẫu hiện hành cho chọn từ danh sách, nên phần lớn giá trị ĐÃ LÀ mã không gian
  //    chuẩn. Chúng đi thẳng vào engine. Cho chúng chạy qua bước quy đổi là nhờ bảng bí danh
  //    dịch một mã về chính nó — đúng cho tới ngày có mã phòng mà tên tiếng Anh không nằm
  //    trong bí danh của chính nó, rồi im lặng biến mất.
  //  · Phần còn lại là chữ tự do (hợp đồng cho phép, và bước dán đầu bài từ tin nhắn sẽ sinh
  //    ra nhiều), mới cần quy đổi.
  //
  // `priorities` KHÔNG đi vào đây. Đó là thứ tự ưu tiên thiết kế ("lấy sáng tự nhiên"), không
  // phải một không gian — đưa vào thì lần chạy nào cũng đọng lại một danh sách "chưa quy được"
  // không bao giờ vơi, và một cảnh báo luôn nổ là một cảnh báo bị bỏ qua.
  const vocabulary = roomVocabulary();
  const known = new Set(vocabulary.codes);
  const declared: string[] = [];
  const freeText: string[] = [];
  for (const phrase of (brief.family ?? []).flatMap((m) => m.needs ?? [])) {
    const text = phrase?.trim();
    if (!text) continue;
    // Tiện ích nằm trong phòng ngủ (tủ đồ, góc học tập…) KHÔNG thành không gian riêng: engine
    // gộp nó vào phòng của chính nhóm thành viên đã khai (`kb/space_norms.yaml` `in_bedroom`).
    if (norms.in_bedroom.includes(text)) continue;
    (known.has(text) ? declared : freeText).push(text);
  }

  const needs = await resolveNeeds(freeText, vocabulary, geminiClient(env));

  // Thống kê thực nghiệm: rỗng ở quy mô kho hiện tại, và đó là hành vi đúng
  // (06-knowledge-base 6.0b). Hỏng khi đọc thì KHÔNG chặn — Lớp 2 vẫn chạy bằng chuẩn nghề
  // nghiệp, chỉ là chất lượng thấp hơn, đúng điều kiện vào của Mốc 4.
  let priors = null;
  try {
    priors = await readRoomAreaPriors(db, norms, {
      tenantId,
      buildingType: brief.building_type,
      siteWidthM: brief.site.width_m,
      floors: brief.floors,
    });
  } catch (error) {
    needs.notes.push(
      `Chưa đọc được thống kê thực nghiệm nên đang dùng chuẩn nghề nghiệp: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // ── Lớp 2a: đề xuất mức ưu tiên của AI, nếu kiến trúc sư đã lấy ─────────────────────
  const intent: ProgramIntent | null = aiIntent
    ? {
        schema_version: '1.0.0',
        emphasis: aiIntent.emphasis,
        add_spaces: aiIntent.add_spaces,
        rationale: aiIntent.rationale,
      }
    : null;

  // Không gian AI đề xuất thêm chỉ được lấy tới đâu còn sàn tới đó (Haan, 13/09/2026). Lời dẫn
  // đã nói luật này; đây là chỗ cưỡng chế — mô hình nói gì thì con số trên bảng cũng không vượt.
  const additions = fitAiAdditions(
    (intent?.add_spaces ?? []).filter((code) => !norms.in_bedroom.includes(code)),
    () =>
      buildSpaceProgram({
        brief,
        briefRef,
        rules,
        norms,
        priors,
        extraSpaces: [...declared, ...needs.spaces],
        plausibility: null,
        intent: null,
      }),
    norms,
    (code: string) => ROOM_LABEL[code] ?? code,
  );
  const appliedIntent = aiIntent
    ? { ...aiIntent, add_spaces: aiIntent.add_spaces.filter((c) => additions.kept.includes(c)) }
    : null;

  const result = buildSpaceProgram({
    brief,
    briefRef,
    rules,
    norms,
    priors,
    // Không gian AI đề xuất thêm đi CHUNG đường với mã khai tường minh: engine vẫn kiểm mã có
    // trong từ vựng và có chuẩn diện tích, nên một đề xuất lạ bị nói ra chứ không lọt vào.
    // Tiện ích trong phòng ngủ mà AI đề xuất thêm cũng không thành phòng riêng — không biết nó
    // thuộc phòng ngủ nào thì bỏ, còn hơn một «Tủ đồ» đứng một mình giữa tầng.
    extraSpaces: [...declared, ...needs.spaces, ...additions.kept],
    plausibility: plausibilityRules(),
    intent,
  });

  return {
    // Đề xuất đi KÈM bản chương trình: nó là một đầu vào đã quyết định con số, và bản chốt phải
    // mang được nó để lần sau tính lại ra đúng mã băm mà không gọi mô hình.
    payload: appliedIntent ? { ...result.payload, ai_intent: appliedIntent } : result.payload,
    plateExplanation: result.plateExplanation,
    warnings: [...result.warnings, ...needs.notes, ...additions.notes],
    unresolved: needs.unresolved,
    aiSuggestion: intent
      ? {
          rationale: intent.rationale ?? '',
          generous: intent.emphasis.filter((e) => e.level === 'generous').map((e) => e.space_type),
          modest: intent.emphasis.filter((e) => e.level === 'modest').map((e) => e.space_type),
        }
      : null,
    params: {
      norms_version: norms.version,
      locality: brief.locality,
      // Chế độ quy tắc đã chạy, KHÔNG phải địa phương đã chọn: hai thứ này khác nhau chừng
      // nào còn tỉnh chưa có gói riêng, và bản kết quả phải nói được mình dựa trên bộ số nào.
      rule_pack_locality: rules.localityMissing ? null : brief.locality,
      priors_band: priors?.bandId ?? null,
      // Đưa ĐÚNG thứ AI đã đề xuất vào tham số, không chỉ cờ "có dùng AI hay không".
      //
      // ⚠️ Cạnh lineage chỉ lưu `params_hash`, không lưu nguyên văn tham số — nên mục này
      // KHÔNG làm đề xuất đọc lại được từ CSDL; nó chỉ bảo đảm một đề xuất khác cho ra một
      // artifact khác, thay vì im lặng trả về bản đã tính với mức nhấn mạnh cũ. Phần đọc lại
      // được cho người là `aiSuggestion` ở trên, hiện thẳng trên màn hình.
      program_intent: intent
        ? { emphasis: intent.emphasis, add_spaces: intent.add_spaces ?? [] }
        : null,
      plausibility_version: plausibilityRules().version,
    },
  };
}
