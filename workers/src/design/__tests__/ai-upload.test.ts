/**
 * Bản vẽ kỹ sư tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4, `ai/upload.ts`).
 *
 * Canh bốn điều:
 *  · hàng rào dữ liệu hạng 1 — thiếu lời xác nhận đã bỏ khung tên thì KHÔNG nhận (T12);
 *  · chỉ nhận PNG đúng một trong ba khung mô hình ảnh dùng — tệp lạ không tới được lượt trả tiền;
 *  · lời dẫn không kể phòng (bản kỹ sư không có toạ độ), dặn không chép khung tên, và mặt đứng
 *    mang đúng yêu cầu trong phần Mặt đứng của đầu bài;
 *  · artifact đúc ra qua được hợp đồng, ghi chú không đi vào lời dẫn.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { aiUploadedDrawingSchema, emptyFacadeBrief } from '@nvg/shared/design';
import { parseAiPrompts } from '../ai/prompts';
import { parseFacadeVocabulary } from '../kb/facade-vocabulary';
import {
  assembleUploadedDrawing,
  checkUploadedPng,
  checkUploadRequest,
  uploadFacadePrompt,
  uploadPlanPrompt,
} from '../ai/upload';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const vocab = parseFacadeVocabulary(read('kb/facade_vocabulary.yaml'));

/** Đầu tệp PNG tối thiểu đủ để đọc khung (chữ ký + IHDR). */
function pngHeader(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set(
    [...'IHDR'].map((ch) => ch.charCodeAt(0)),
    12,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('Yêu cầu tải lên', () => {
  it('thiếu xác nhận đã bỏ khung tên thì từ chối — kể cả `"true"` dạng chuỗi', () => {
    expect(checkUploadRequest({ drawing: 'plan', level: 1 }).ok).toBe(false);
    expect(checkUploadRequest({ drawing: 'plan', level: 1, identityCleared: 'true' }).ok).toBe(
      false,
    );
    const ok = checkUploadRequest({ drawing: 'plan', level: 2, identityCleared: true });
    expect(ok).toEqual({ ok: true, drawing: 'plan', level: 2 });
  });

  it('loại bản vẽ và tầng phải hợp lệ; mặt đứng không có tầng', () => {
    expect(checkUploadRequest({ drawing: 'section', identityCleared: true }).ok).toBe(false);
    expect(checkUploadRequest({ drawing: 'plan', level: 0, identityCleared: true }).ok).toBe(false);
    expect(checkUploadRequest({ drawing: 'plan', level: 1.5, identityCleared: true }).ok).toBe(
      false,
    );
    expect(checkUploadRequest({ drawing: 'facade', level: 3, identityCleared: true })).toEqual({
      ok: true,
      drawing: 'facade',
      level: null,
    });
  });
});

describe('Tệp tải lên', () => {
  it('nhận đúng ba khung của mô hình ảnh', () => {
    for (const [w, h] of [
      [1024, 1024],
      [1536, 1024],
      [1024, 1536],
    ] as const) {
      expect(checkUploadedPng(pngHeader(w, h))).toEqual({ ok: true, width: w, height: h });
    }
  });

  it('khung khác, không phải PNG, hay quá trần thì từ chối', () => {
    expect(checkUploadedPng(pngHeader(1200, 800)).ok).toBe(false);
    expect(
      checkUploadedPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)])).ok,
    ).toBe(false);
    expect(checkUploadedPng(pngHeader(1024, 1024, 6 * 1024 * 1024)).ok).toBe(false);
  });
});

describe('Lời dẫn', () => {
  it('mặt bằng: không kể phòng, dặn không chép khung tên, mang phong cách đầu bài', () => {
    const p = uploadPlanPrompt({ level: 2, styleCode: 'indochine', prompts });
    expect(p.prompt).toContain('Storey 2');
    expect(p.prompt).toContain(prompts.sheetImage.styles.indochine);
    expect(p.system).toMatch(/title block/i);
    expect(p.system).toMatch(/never invent a name/i);
    expect(p.prompt).not.toMatch(/\{[a-z_]+\}/);
  });

  it('mặt bằng: đầu bài không có phong cách thì bỏ hẳn câu ấy, không thay bằng mặc định', () => {
    const p = uploadPlanPrompt({ level: 1, styleCode: null, prompts });
    expect(p.prompt.trim()).toBe('Storey: Ground floor (storey 1)');
  });

  it('mặt đứng: mang yêu cầu đã chốt trong phần Mặt đứng của đầu bài', () => {
    const brief = { ...emptyFacadeBrief(), style: 'hien_dai' as const };
    brief.roof = { ...brief.roof, type: 'hip' };
    const p = uploadFacadePrompt({ facadeBrief: brief, vocab, prompts });
    expect(p.prompt).toContain(prompts.facadeImage.styles.hien_dai);
    expect(p.prompt).toContain('REQUIRED roof type: hip');
    expect(p.system).toMatch(/title block/i);
    expect(p.prompt).not.toMatch(/\{[a-z_]+\}/);
  });
});

describe('Artifact bản vẽ tải lên', () => {
  const base = {
    uri: 'supabase://design-renders/p/upload/abc.png',
    width: 1536 as const,
    height: 1024 as const,
    sha256: 'a'.repeat(64),
    bytes: 1234,
  };

  it('qua được hợp đồng; mặt đứng không mang tầng; ghi chú gọt gọn', () => {
    const plan = assembleUploadedDrawing({
      ...base,
      drawing: 'plan',
      level: null,
      note: '  Sau khi sửa WC  ',
    });
    expect(aiUploadedDrawingSchema.safeParse(plan).success).toBe(true);
    expect(plan.level).toBe(1);
    expect(plan.note).toBe('Sau khi sửa WC');
    const facade = assembleUploadedDrawing({ ...base, drawing: 'facade', level: 3, note: '' });
    expect(aiUploadedDrawingSchema.safeParse(facade).success).toBe(true);
    expect(facade.level).toBeNull();
    expect(facade.note).toBeNull();
  });

  it('hợp đồng chặn artifact thiếu lời xác nhận khung tên', () => {
    const plan = assembleUploadedDrawing({ ...base, drawing: 'plan', level: 1, note: null });
    expect(aiUploadedDrawingSchema.safeParse({ ...plan, identity_cleared: false }).success).toBe(
      false,
    );
  });
});
