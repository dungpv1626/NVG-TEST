/**
 * Khối nền K1 — ghi âm → chữ → nháp AI cho các bộ phận (Đợt 1 — 1D, doc/KE_HOACH_LAM_HO.md).
 *
 * Ba tuyến, mọi tuyến chạy DƯỚI PHIÊN NGƯỜI GỌI (`asUser`) nên RLS quyết ai đọc / ghi được gì:
 *   GET  /ai/status          — chức năng nào đang tắt / giả lập / chạy thật (giao diện ẩn nút)
 *   POST /ai/transcribe      — một đoạn ghi âm khảo sát → chữ (Cloudflare Workers AI Whisper)
 *   POST /ai/survey-summary  — chữ của các đoạn ghi âm → nháp 6 ô báo cáo (Gemini Flash trả phí)
 *
 * Hàng rào chi phí (CLAUDE.md 6.4, chủ dự án chốt «AI làm bằng giả lập trước»):
 *   · `AI_FAKE=1` (chỉ đặt trong `workers/.dev.vars`) → trả kết quả MẪU, không gọi ai cả.
 *   · Không giả lập thì chỉ gọi thật khi công tắc `ai.*_enabled` = 1 VÀ có khoá / binding. Công tắc
 *     để trống = tắt; người dùng tự gõ, luồng không bị chặn (CLAUDE.md 5.1).
 *   · Mọi lần gọi — giả lập hay thật, thành hay hỏng — ghi một dòng `ai_calls`.
 * Máy chỉ viết NHÁP: người khảo sát xem, sửa rồi mới lưu; Ban Giám đốc duyệt (PRD 2.3).
 */

import { Hono, type Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { asUser, type UserDb } from '../design/auth-scope';
import type { DesignEnv } from '../design/env';

export interface AiEnv extends DesignEnv {
  /** `1` = giả lập mọi chức năng AI (máy phát triển). KHÔNG đặt trên bản demo / vận hành. */
  AI_FAKE?: string;
  /** Binding Workers AI — chưa khai trong `wrangler.jsonc`; khai khi chủ dự án duyệt chi phí. */
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

type Mode = 'off' | 'fake' | 'on';

const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const SUMMARY_MODEL = 'gemini-2.5-flash';
/** Workers AI tính theo phút âm thanh — mức công bố, chỉ để ghi sổ, không dùng để chặn. */
const WHISPER_USD_PER_MINUTE = 0.0005;
/** Gemini 2.5 Flash gói trả phí, USD / 1 triệu token (vào / ra) — chỉ để ghi sổ. */
const GEMINI_USD_PER_MTOK = { input: 0.3, output: 2.5 };

const SURVEY_FIELDS = [
  'needs',
  'decision_maker',
  'budget_note',
  'schedule_note',
  'commercial_terms',
  'notes',
] as const;
type SurveyDraft = Record<(typeof SURVEY_FIELDS)[number], string>;

export const aiApp = new Hono<{ Bindings: AiEnv }>();

function bearer(c: Context<{ Bindings: AiEnv }>): string | null {
  const header = c.req.header('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function service(env: AiEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function switchOn(env: AiEnv, key: string): Promise<boolean> {
  const { data } = await service(env).rpc('system_parameter_number', { p_key: key });
  return Number(data) === 1;
}

async function modes(env: AiEnv): Promise<{ transcribe: Mode; summary: Mode }> {
  if (env.AI_FAKE === '1') return { transcribe: 'fake', summary: 'fake' };
  const [t, s] = await Promise.all([
    switchOn(env, 'ai.transcribe_enabled'),
    switchOn(env, 'ai.survey_summary_enabled'),
  ]);
  return {
    transcribe: t && env.AI ? 'on' : 'off',
    summary: s && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
  };
}

async function logCall(
  env: AiEnv,
  row: {
    company_id: string | null;
    user_id: string | null;
    feature: string;
    provider: string;
    model: string | null;
    is_fake: boolean;
    input_units?: number | null;
    output_units?: number | null;
    cost_usd?: number | null;
    ok: boolean;
    error?: string | null;
    entity_type: string;
    entity_id: string;
  },
): Promise<void> {
  // Ghi sổ hỏng không được làm hỏng việc của người dùng — chỉ ghi log máy chủ.
  const { error } = await service(env).from('ai_calls').insert(row);
  if (error) console.error('ai_calls: không ghi được', error.message);
}

async function actorId(db: UserDb): Promise<string | null> {
  const { data } = await db.rpc('auth_user_id');
  return (data as string | null) ?? null;
}

const OFF_MESSAGE =
  'Chức năng AI chưa bật — người khảo sát tự gõ nội dung. Quản trị bật ở Tham số hệ thống khi chủ dự án duyệt chi phí.';

aiApp.get('/status', async (c) => {
  if (!bearer(c)) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  return c.json(await modes(c.env));
});

// ---------------------------------------------------------------------------------------------
// Ghi âm → chữ
// ---------------------------------------------------------------------------------------------
aiApp.post('/transcribe', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { recording_id?: string };
  if (!body.recording_id) return c.json({ error: 'Thiếu đoạn ghi âm.' }, 400);

  const db = await asUser(c.env, token);
  const { data: rec, error } = await db
    .from('site_survey_recordings')
    .select('id, survey_id, company_id, storage_path, mime_type, duration_seconds')
    .eq('id', body.recording_id)
    .maybeSingle();
  if (error || !rec)
    return c.json({ error: 'Không tìm thấy đoạn ghi âm, hoặc không có quyền.' }, 404);

  const mode = (await modes(c.env)).transcribe;
  if (mode === 'off') return c.json({ error: OFF_MESSAGE }, 409);
  const user = await actorId(db);
  const base = {
    company_id: rec.company_id as string,
    user_id: user,
    feature: 'transcribe',
    entity_type: 'site_survey_recordings',
    entity_id: rec.id as string,
  };

  let transcript: string;
  if (mode === 'fake') {
    transcript = fakeTranscript(rec.duration_seconds as number | null);
    await logCall(c.env, { ...base, provider: 'gia_lap', model: null, is_fake: true, ok: true });
  } else {
    try {
      const file = await db.storage.from('survey-audio').download(rec.storage_path as string);
      if (file.error || !file.data) throw new Error('Không đọc được tệp ghi âm.');
      const audio = btoa(
        Array.from(new Uint8Array(await file.data.arrayBuffer()), (b) =>
          String.fromCharCode(b),
        ).join(''),
      );
      const out = (await c.env.AI!.run(WHISPER_MODEL, { audio, language: 'vi' })) as {
        text?: string;
      };
      transcript = (out.text ?? '').trim();
      const minutes = Math.max(1, Math.ceil(((rec.duration_seconds as number | null) ?? 60) / 60));
      await logCall(c.env, {
        ...base,
        provider: 'cloudflare',
        model: WHISPER_MODEL,
        is_fake: false,
        input_units: minutes,
        cost_usd: minutes * WHISPER_USD_PER_MINUTE,
        ok: true,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logCall(c.env, {
        ...base,
        provider: 'cloudflare',
        model: WHISPER_MODEL,
        is_fake: false,
        ok: false,
        error: message,
      });
      await db
        .from('site_survey_recordings')
        .update({
          transcript_status: 'loi',
          transcript_note: 'Chuyển giọng nói không thành — gõ tay.',
        })
        .eq('id', rec.id);
      return c.json(
        { error: 'Chuyển giọng nói thành chữ không thành. Gõ tay nội dung thay thế.' },
        502,
      );
    }
  }

  const { error: saveError } = await db
    .from('site_survey_recordings')
    .update({
      transcript,
      transcript_status: 'xong',
      transcript_note: mode === 'fake' ? 'Giả lập — chưa bật chuyển giọng nói thật.' : null,
    })
    .eq('id', rec.id)
    .select('id')
    .single();
  if (saveError)
    return c.json({ error: 'Không lưu được bản chép chữ — báo cáo có thể đã gửi duyệt.' }, 409);
  return c.json({ transcript, fake: mode === 'fake' });
});

// ---------------------------------------------------------------------------------------------
// Chữ → nháp báo cáo khảo sát
// ---------------------------------------------------------------------------------------------
aiApp.post('/survey-summary', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { survey_id?: string };
  if (!body.survey_id) return c.json({ error: 'Thiếu biên bản khảo sát.' }, 400);

  const db = await asUser(c.env, token);
  const { data: writable } = await db.rpc('rls_survey_writable', { p_survey_id: body.survey_id });
  if (!writable) {
    return c.json(
      {
        error:
          'Chỉ người phụ trách cơ hội viết được báo cáo, và chỉ khi báo cáo đang ở Nháp hoặc bị trả về.',
      },
      403,
    );
  }
  const [{ data: recs }, { data: survey }] = await Promise.all([
    db
      .from('site_survey_recordings')
      .select('transcript, company_id, created_at')
      .eq('survey_id', body.survey_id)
      .eq('transcript_status', 'xong')
      .order('created_at', { ascending: true }),
    db.from('site_surveys').select('id, opportunity_id').eq('id', body.survey_id).single(),
  ]);
  const transcripts = (recs ?? []).map((r) => (r.transcript as string) ?? '').filter(Boolean);
  if (transcripts.length === 0) {
    return c.json(
      { error: 'Chưa có đoạn ghi âm nào đã chép chữ — ghi âm hoặc chép chữ trước.' },
      400,
    );
  }

  const mode = (await modes(c.env)).summary;
  if (mode === 'off') return c.json({ error: OFF_MESSAGE }, 409);
  const user = await actorId(db);
  const base = {
    company_id: ((recs ?? [])[0]?.company_id as string | undefined) ?? null,
    user_id: user,
    feature: 'survey_summary',
    entity_type: 'site_surveys',
    entity_id: body.survey_id,
  };

  let draft: SurveyDraft;
  if (mode === 'fake') {
    draft = fakeSummary(transcripts.join('\n'));
    await logCall(c.env, { ...base, provider: 'gia_lap', model: null, is_fake: true, ok: true });
  } else {
    try {
      const result = await geminiSummary(c.env.GEMINI_PAID_API_KEY!, transcripts);
      draft = result.draft;
      await logCall(c.env, {
        ...base,
        provider: 'gemini_paid',
        model: SUMMARY_MODEL,
        is_fake: false,
        input_units: result.inputTokens,
        output_units: result.outputTokens,
        cost_usd:
          (result.inputTokens * GEMINI_USD_PER_MTOK.input +
            result.outputTokens * GEMINI_USD_PER_MTOK.output) /
          1_000_000,
        ok: true,
      });
    } catch (e) {
      await logCall(c.env, {
        ...base,
        provider: 'gemini_paid',
        model: SUMMARY_MODEL,
        is_fake: false,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return c.json({ error: 'Máy chưa viết được báo cáo. Gõ tay các ô báo cáo thay thế.' }, 502);
    }
  }

  await db
    .from('site_surveys')
    .update({
      ai_draft: { ...draft, fake: mode === 'fake' },
      ai_draft_at: new Date().toISOString(),
    })
    .eq('id', survey!.id);
  return c.json({ draft, fake: mode === 'fake' });
});

// ---------------------------------------------------------------------------------------------

async function geminiSummary(
  key: string,
  transcripts: string[],
): Promise<{ draft: SurveyDraft; inputTokens: number; outputTokens: number }> {
  const prompt = [
    'Bạn là trợ lý của nhân viên kinh doanh một công ty xây dựng ở Việt Nam.',
    'Dưới đây là bản chép chữ ghi âm buổi khảo sát với khách. Tóm tắt thành báo cáo khảo sát,',
    'CHỈ dùng điều khách / nhân viên đã nói; điều không được nhắc tới thì ghi «Chưa rõ».',
    'Không bịa số liệu, không đề xuất giá. Viết tiếng Việt, ngắn gọn, gạch đầu dòng khi cần.',
    '',
    ...transcripts.map((t, i) => `--- Đoạn ghi âm ${i + 1} ---\n${t}`),
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: Object.fromEntries(SURVEY_FIELDS.map((f) => [f, { type: 'STRING' }])),
    required: [...SURVEY_FIELDS],
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini trả ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text) as Partial<SurveyDraft>;
  const draft = Object.fromEntries(
    SURVEY_FIELDS.map((f) => [f, String(parsed[f] ?? 'Chưa rõ').trim()]),
  ) as SurveyDraft;
  return {
    draft,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** Bản chép chữ MẪU — nói rõ là giả lập để không ai lẫn với lời khách thật. */
function fakeTranscript(seconds: number | null): string {
  const length = seconds ? ` (${seconds} giây ghi âm)` : '';
  return [
    `[Giả lập${length}] Khách cho biết cần xây nhà xưởng khung thép khoảng 2.000 m² trên lô đất`,
    'đã có, mặt tiền giáp đường nội bộ khu công nghiệp. Người quyết định là giám đốc công ty, anh Hùng.',
    'Ngân sách dự kiến khoảng 8 tỷ đồng, muốn khởi công trong quý 1 và hoàn thành trước tháng 8.',
    'Khách muốn thanh toán theo tiến độ, tạm ứng không quá 20 phần trăm. Hiện trạng đất đã san lấp,',
    'có điện ba pha, chưa có hệ thống thoát nước.',
  ].join(' ');
}

/** Nháp báo cáo MẪU dựng từ bản chép chữ mẫu — đủ để chạy thử luồng sửa, gửi, duyệt. */
function fakeSummary(transcript: string): SurveyDraft {
  const real = !transcript.startsWith('[Giả lập');
  return {
    needs: real
      ? `[Giả lập] Tóm tắt từ ghi âm: ${transcript.slice(0, 200)}${transcript.length > 200 ? '…' : ''}`
      : '[Giả lập] Nhà xưởng khung thép khoảng 2.000 m² trên lô đất có sẵn, mặt tiền đường nội bộ KCN.',
    decision_maker: '[Giả lập] Giám đốc công ty — anh Hùng.',
    budget_note: '[Giả lập] Khoảng 8 tỷ đồng.',
    schedule_note: '[Giả lập] Khởi công quý 1, hoàn thành trước tháng 8.',
    commercial_terms: '[Giả lập] Thanh toán theo tiến độ, tạm ứng không quá 20%.',
    notes: '[Giả lập] Đất đã san lấp, có điện ba pha, chưa có hệ thống thoát nước.',
  };
}
