/**
 * Quy nhãn phòng nguyên văn về mã phòng chuẩn (Mốc 3, Bước 1 phần cuối).
 *
 * Test này canh hai thứ dễ hỏng âm thầm:
 *
 *  1. **Tính tất định.** Bản ghi Knowledge Base được dùng làm few-shot, nên một nhãn quy sai
 *     không dừng ở một hồ sơ — nó dạy sai cho mọi phương án sinh sau đó. Nhãn nào bảng bí
 *     danh trả lời được thì KHÔNG được đi hỏi mô hình ngôn ngữ.
 *  2. **Từ vựng phủ được rule pack.** Một mã phòng mà không rule nào nhắm tới sẽ đi qua toàn
 *     bộ engine mà chưa từng bị kiểm quy chuẩn nào, và không có lỗi nào nổ ra.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { normaliseRoomLabels, UNKNOWN } from '../kb/normalize-labels';
import { normaliseKey, parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import type { GeminiClient } from '../llm/gemini';
import { LlmCallFailed } from '../llm/gemini';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const vocabulary = parseVocabulary(readFileSync(root('kb/room_vocabulary.yaml'), 'utf8'));
const index = new VocabularyIndex(vocabulary);

/** Mô hình giả — chỉ để khẳng định CÓ hay KHÔNG gọi, và gọi với đúng những nhãn nào. */
function fakeLlm(answer: { label: string; code: string }[] | Error) {
  const generateJson = vi.fn(async (_route: string, _dc: number, options: { prompt: string }) => {
    void options;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { client: { generateJson } as unknown as GeminiClient, generateJson };
}

const plan = (...labels: (string | null)[]) => ({
  rooms: labels.map((label_raw) => ({ label_raw })),
});

describe('Từ vựng phòng', () => {
  it('phủ được mọi mã phòng mà rule pack nhắm tới', () => {
    const groups = new Set(Object.keys(vocabulary.group_targets ?? {}));
    const codes = new Set(vocabulary.types.map((t) => t.code));

    // Duyệt gói nền CỘNG mọi gói địa phương đang có, thay vì liệt kê tay: gói địa phương
    // sinh ra khi tỉnh gửi văn bản quy hoạch, và người thêm gói đó không có lý do gì để nhớ
    // quay lại sửa danh sách trong một tệp kiểm thử.
    const localityRoot = root('rules/locality');
    const localityDirs = readdirSync(localityRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `rules/locality/${entry.name}`);

    const targets = new Set<string>();
    for (const dir of ['rules/base', ...localityDirs]) {
      let files: string[];
      try {
        files = readdirSync(root(dir)).filter((f) => f.endsWith('.yaml'));
      } catch {
        continue;
      }
      for (const file of files) {
        const rules = parseYaml(readFileSync(root(`${dir}/${file}`), 'utf8'));
        for (const rule of Array.isArray(rules) ? rules : []) {
          const target = (rule as { target?: string }).target;
          if (target) targets.add(target);
        }
      }
    }

    expect(targets.size).toBeGreaterThan(0);
    const missing = [...targets].filter((t) => !codes.has(t) && !groups.has(t));
    expect(missing).toEqual([]);
  });

  it('bỏ dấu, bỏ dấu chấm và khoảng trắng khi so khớp', () => {
    expect(normaliseKey('P.Ngủ 2')).toBe('PNGU2');
    expect(index.lookup('PHÒNG NGỦ 2')).toBe('bedroom');
    expect(index.lookup('p.ngu')).toBe('bedroom');
    expect(index.lookup('Bếp')).toBe('kitchen');
  });

  it('số đuôi là số thứ tự phòng, không đổi loại phòng', () => {
    expect(index.lookup('PN2')).toBe('bedroom');
    expect(index.lookup('PN3')).toBe('bedroom');
    expect(index.lookup('WC2')).toBe('wc');
  });

  it('nhận cả chính mã chuẩn — bản vẽ do hệ thống xuất ra không phải đi vòng qua mô hình', () => {
    for (const type of vocabulary.types) expect(index.lookup(type.code)).toBe(type.code);
  });

  it('từ chối mã phòng không hợp lệ theo hợp đồng kb-record', () => {
    expect(() => parseVocabulary("version: '1.0.0'\ntypes:\n  - code: 'Phòng Ngủ'\n  ")).toThrow(
      /a-z0-9_/,
    );
  });
});

describe('Chuẩn hoá nhãn phòng', () => {
  it('không gọi mô hình khi bảng bí danh trả lời được hết', async () => {
    const { client, generateJson } = fakeLlm([]);
    const result = await normaliseRoomLabels([plan('PK', 'BEP', 'WC')], index, client);

    expect(result.roomTypes).toEqual([['living', 'kitchen', 'wc']]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('phòng không có nhãn cho ra mã rỗng, không đoán bừa', async () => {
    const result = await normaliseRoomLabels([plan('PK', null, '   ')], index);
    expect(result.roomTypes).toEqual([['living', null, null]]);
    expect(result.unresolved).toEqual([]);
  });

  it('chỉ hỏi mô hình phần bảng bí danh không trả lời được, và lọc trùng', async () => {
    const { client, generateJson } = fakeLlm([{ label: 'P.SINH HOAT', code: 'living' }]);
    await normaliseRoomLabels(
      [plan('PK', 'P.SINH HOAT'), plan('P.SINH HOAT', 'WC')],
      index,
      client,
    );

    expect(generateJson).toHaveBeenCalledTimes(1);
    const prompt = generateJson.mock.calls[0]![2].prompt;
    expect(prompt).toContain('P.SINH HOAT');
    expect(prompt).not.toContain('PK');
  });

  it('áp kết quả suy đoán cho MỌI tầng có cùng nhãn', async () => {
    const { client } = fakeLlm([{ label: 'P.SINH HOAT', code: 'living' }]);
    const result = await normaliseRoomLabels(
      [plan('P.SINH HOAT'), plan('WC', 'P.SINH HOAT')],
      index,
      client,
    );
    expect(result.roomTypes).toEqual([['living'], ['wc', 'living']]);
    expect(result.inferred).toEqual([{ label: 'P.SINH HOAT', code: 'living' }]);
  });

  it('bỏ qua mã lạ do mô hình bịa ra', async () => {
    // `responseSchema` là ràng buộc của nhà cung cấp, không phải của mình. Mã lạ lọt qua sẽ
    // vi phạm hợp đồng kb-record ở tận bước sau, nơi thông báo lỗi không còn nhắc gì tới mô
    // hình ngôn ngữ nữa.
    const { client } = fakeLlm([
      { label: 'P.LẠ', code: 'phong_gi_do' },
      { label: 'KHÔNG HỎI', code: 'living' },
    ]);
    const result = await normaliseRoomLabels([plan('P.LẠ')], index, client);

    expect(result.roomTypes).toEqual([[null]]);
    expect(result.unresolved).toEqual(['P.LẠ']);
  });

  it('mã "không rõ" của mô hình không trở thành mã phòng', async () => {
    const { client } = fakeLlm([{ label: 'XYZ', code: UNKNOWN }]);
    const result = await normaliseRoomLabels([plan('XYZ')], index, client);
    expect(result.roomTypes).toEqual([[null]]);
  });

  it('mô hình hỏng KHÔNG giết mẻ số hoá — bản ghi vẫn ra, chỉ mất phần suy đoán', async () => {
    // Tính năng mô hình ngôn ngữ là PHỤ TRỢ (PRD 5.1): hết hạn mức không được chặn luồng chính.
    const { client } = fakeLlm(new LlmCallFailed('hết hạn mức', true, 429));
    const result = await normaliseRoomLabels([plan('PK', 'P.LẠ')], index, client);

    expect(result.roomTypes).toEqual([['living', null]]);
    expect(result.unresolved).toEqual(['P.LẠ']);
  });

  it('chạy được khi chưa cấu hình mô hình nào', async () => {
    const result = await normaliseRoomLabels([plan('PK', 'P.LẠ')], index);
    expect(result.roomTypes).toEqual([['living', null]]);
    expect(result.unresolved).toEqual(['P.LẠ']);
  });
});
