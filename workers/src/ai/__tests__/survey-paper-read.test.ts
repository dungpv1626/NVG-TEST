/**
 * Máy đọc phiếu khảo sát giấy (28/10/2026). Phần thuần: khoá lạ bị loại, danh tính khách bị lược, giới
 * hạn ảnh. Tuyến `POST /ai/survey-paper-read` chạy với client Supabase GIẢ và `fetch` giả — không gọi
 * Gemini thật: công tắc tắt, không quyền sửa, báo cáo đã gửi duyệt thì từ chối; lời đáp có tên / số
 * điện thoại khách thì bị lược trước khi trả về.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { surveyPaperFields } from '@nvg/shared';
import {
  fakePaperRead,
  normalizePaperRead,
  paperIdentities,
  paperPrompt,
  parsePaperPages,
} from '../survey-paper-read';

const customer = {
  name: 'Công ty TNHH Cơ khí Minh Phát',
  contact_person: 'Ông Trần Văn Phát',
  representative_name: null,
  phone: '0988 100 606',
  email: 'phat@minhphat.vn',
  address: 'Lô C7, KCN Minh Đức, Mỹ Hào, Hưng Yên',
  tax_code: '0901234567',
};

describe('survey-paper-read (phần thuần)', () => {
  const fields = surveyPaperFields('NVC');

  it('danh mục có sáu ô báo cáo trước, ô phiếu riêng mang tiền tố site.', () => {
    expect(fields.slice(0, 6).map((f) => f.key)).toEqual([
      'needs',
      'decision_maker',
      'budget_note',
      'schedule_note',
      'commercial_terms',
      'notes',
    ]);
    expect(fields.some((f) => f.key === 'site.crane')).toBe(true);
    expect(surveyPaperFields('NVG')).toHaveLength(6);
  });

  it('loại khoá lạ, bỏ ô rỗng, lược tên / điện thoại / địa chỉ khách', () => {
    const { accepted, rejected } = normalizePaperRead(
      fields,
      {
        fields: [
          { key: 'notes', value: 'Gọi anh Phát 0988100606 trước khi tới', confidence: 'ro' },
          {
            key: 'needs',
            value: 'Xưởng 1.500 m² ở Lô C7, KCN Minh Đức, Mỹ Hào, Hưng Yên',
            confidence: 'ro',
          },
          { key: 'decision_maker', value: 'Trần Văn Phát', confidence: 'khong_ro' },
          { key: 'site.crane', value: 'Cầu trục 5 tấn', confidence: 'khong_ro' },
          { key: 'customer_name', value: 'Công ty TNHH Cơ khí Minh Phát', confidence: 'ro' },
          { key: 'budget_note', value: '   ', confidence: 'ro' },
        ],
      },
      paperIdentities(customer),
    );
    expect(rejected.map((r) => r.key)).toEqual(['customer_name']);
    const all = JSON.stringify(accepted);
    expect(all).not.toContain('Phát 0988');
    expect(all).not.toContain('0988100606');
    expect(all).not.toContain('Mỹ Hào');
    expect(all).not.toContain('Trần Văn Phát');
    // Chỉ còn danh tính đã lược thì bỏ hẳn ô — không áp «[đã lược]» vào biên bản.
    expect(accepted.map((a) => a.key)).toEqual(['needs', 'notes', 'site.crane']);
    expect(accepted.find((a) => a.key === 'needs')!.value).toContain('Xưởng 1.500 m²');
    expect(accepted.find((a) => a.key === 'site.crane')).toMatchObject({
      label: 'Cầu trục',
      group: 'site',
      confidence: 'khong_ro',
    });
  });

  it('kiểm ảnh: 1–4 trang JPEG base64, có giới hạn kích thước', () => {
    expect(parsePaperPages([])).toHaveProperty('error');
    expect(parsePaperPages([{ mime_type: 'application/pdf', data: 'AAAA' }])).toHaveProperty(
      'error',
    );
    expect(
      parsePaperPages([{ mime_type: 'image/jpeg', data: 'không phải base64' }]),
    ).toHaveProperty('error');
    expect(
      parsePaperPages(Array.from({ length: 5 }, () => ({ mime_type: 'image/jpeg', data: 'AAAA' }))),
    ).toHaveProperty('error');
    expect(
      parsePaperPages([{ mime_type: 'image/jpeg', data: 'A'.repeat(2_100_000) }]),
    ).toHaveProperty('error');
    expect(parsePaperPages([{ mime_type: 'image/jpeg', data: 'AAAA' }])).toEqual({
      pages: [{ mime_type: 'image/jpeg', data: 'AAAA' }],
    });
  });

  it('lời dẫn liệt kê khoá của phiếu và dặn không chép danh tính', () => {
    const prompt = paperPrompt(fields);
    expect(prompt).toContain('- site.crane | Cầu trục');
    expect(prompt).toContain('KHÔNG chép họ tên người, số điện thoại');
  });

  it('giả lập ghi rõ «[Giả lập]» và chỉ dùng khoá của phiếu', () => {
    const fake = fakePaperRead('NVO');
    const keys = new Set(surveyPaperFields('NVO').map((f) => f.key));
    expect(fake.fields.length).toBeGreaterThan(0);
    for (const f of fake.fields) {
      expect(f.value.startsWith('[Giả lập]')).toBe(true);
      expect(keys.has(f.key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Tuyến, với client Supabase giả
// ---------------------------------------------------------------------------------------------

interface World {
  switchOn: boolean;
  writable: boolean;
  status: string;
  logs: Record<string, unknown>[];
}
const world: World = { switchOn: true, writable: true, status: 'nhap', logs: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const query = (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            table === 'site_surveys'
              ? {
                  id: 's1',
                  report_status: world.status,
                  opportunity: {
                    company_id: 'c1',
                    company: { code: 'NVC' },
                    customer,
                  },
                }
              : null,
        }),
        insert: async (row: Record<string, unknown>) => {
          world.logs.push(row);
          return { error: null };
        },
      };
      return q;
    };
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'system_parameter_number')
          return {
            data: args.p_key === 'ai.survey_paper_read_enabled' && world.switchOn ? 1 : null,
          };
        if (name === 'rls_survey_writable') return { data: world.writable };
        if (name === 'auth_user_id') return { data: 'u1' };
        return { data: null };
      },
      from: query,
    };
  },
}));

// `auth-scope` và `form-config` kéo theo tệp YAML của Module Thiết kế (Worker nạp lúc dựng) — tuyến này
// không dùng tới, thay bằng bản tối thiểu.
vi.mock('../../design/auth-scope', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { asUser: async () => createClient('', '') };
});
vi.mock('../../design/brief/form-config', () => ({ readEffectiveBriefForm: vi.fn() }));

const { assistantApp } = await import('../index');

const env = {
  SUPABASE_URL: 'http://gia.local',
  SUPABASE_SERVICE_ROLE_KEY: 'gia',
  GEMINI_PAID_API_KEY: 'gia',
  AI_FAKE: '',
};

function post(body: unknown, e: Record<string, unknown> = env) {
  return assistantApp.request(
    '/survey-paper-read',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    e,
  );
}

const PAGES = [{ mime_type: 'image/jpeg', data: 'AAAA' }];

function geminiReturns(fields: unknown) {
  return vi.fn(async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ fields }) }] } }],
      usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 400, thoughtsTokenCount: 200 },
    }),
  );
}

describe('POST /ai/survey-paper-read (client giả)', () => {
  beforeEach(() => {
    Object.assign(world, { switchOn: true, writable: true, status: 'nhap', logs: [] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lược tên / điện thoại khách trong lời đáp, loại khoá lạ, ghi sổ chi phí', async () => {
    const fetchMock = geminiReturns([
      {
        key: 'notes',
        value: 'Liên hệ ông Trần Văn Phát, 0988 100 606, đường vào hẹp',
        confidence: 'ro',
      },
      { key: 'ten_khach', value: 'Công ty TNHH Cơ khí Minh Phát', confidence: 'ro' },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ survey_id: 's1', pages: PAGES });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      accepted: { key: string; value: string }[];
      rejected: { key: string }[];
    };
    const text = JSON.stringify(json.accepted);
    expect(text).not.toContain('Trần Văn Phát');
    expect(text).not.toContain('0988 100 606');
    expect(text).toContain('đường vào hẹp');
    expect(json.rejected.map((r) => r.key)).toEqual(['ten_khach']);
    // Ảnh tới Gemini đúng như trình duyệt gửi (đã che), không thêm gì.
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(sent.contents[0].parts[1]).toEqual({
      inline_data: { mime_type: 'image/jpeg', data: 'AAAA' },
    });
    expect(world.logs).toHaveLength(1);
    expect(world.logs[0]).toMatchObject({
      feature: 'survey_paper_read',
      is_fake: false,
      ok: true,
      input_units: 3000,
      output_units: 600,
    });
  });

  it('công tắc tắt thì từ chối, không gọi mô hình', async () => {
    world.switchOn = false;
    const fetchMock = geminiReturns([]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ survey_id: 's1', pages: PAGES });
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('không có quyền sửa khảo sát thì từ chối', async () => {
    world.writable = false;
    const fetchMock = geminiReturns([]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ survey_id: 's1', pages: PAGES });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('báo cáo đã gửi duyệt thì từ chối, nói rõ lý do', async () => {
    world.writable = false;
    world.status = 'cho_duyet';
    const fetchMock = geminiReturns([]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ survey_id: 's1', pages: PAGES });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('đã gửi Ban Giám đốc');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Gemini quá tải (503) thì báo thử lại', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('busy', { status: 503 })),
    );
    const res = await post({ survey_id: 's1', pages: PAGES });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain('quá tải');
    expect(world.logs[0]).toMatchObject({ ok: false });
  });

  it('AI_FAKE=survey_paper trả nháp mẫu, không gọi mô hình', async () => {
    world.switchOn = false;
    const fetchMock = geminiReturns([]);
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ survey_id: 's1', pages: PAGES }, { ...env, AI_FAKE: 'survey_paper' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { fake: boolean; accepted: { value: string }[] };
    expect(json.fake).toBe(true);
    expect(json.accepted.every((a) => a.value.startsWith('[Giả lập]'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
