/**
 * Khối nền K1 — ghi âm → chữ → nháp AI cho các bộ phận (Đợt 1 — 1D, doc/KE_HOACH_LAM_HO.md).
 *
 * Ba tuyến, mọi tuyến chạy DƯỚI PHIÊN NGƯỜI GỌI (`asUser`) nên RLS quyết ai đọc / ghi được gì:
 *   GET  /ai/status          — chức năng nào đang tắt / giả lập / chạy thật (giao diện ẩn nút)
 *   POST /ai/transcribe      — một đoạn ghi âm khảo sát → chữ (Cloudflare Workers AI Whisper)
 *   POST /ai/survey-summary  — chữ của các đoạn ghi âm → nháp 6 ô báo cáo (Gemini Flash trả phí)
 *   POST /ai/site-log-draft  — một đoạn ghi âm nhật ký công trường → chữ → nháp các mục (Đợt 2 — 2B);
 *                              `purpose: 'transcript'` chỉ chép chữ (lời khách báo bảo hành — 2F)
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
import {
  SITE_LOG_DRAFT_SECTIONS,
  normalizeSiteLogDraft,
  type SiteLogVoiceDraft,
} from '@nvg/shared';
import { stripWhisperHallucinations } from './whisper-hallucination';

export interface AiEnv extends DesignEnv {
  /**
   * Giả lập AI trên máy phát triển — KHÔNG đặt trên bản demo / vận hành. `1` = giả lập mọi chức
   * năng; hoặc danh sách cách nhau bởi dấu phẩy (`summary`, `transcribe`) = chỉ giả lập những
   * chức năng đó, chức năng còn lại đi theo công tắc như bình thường.
   */
  AI_FAKE?: string;
  /** Binding Workers AI (`wrangler.jsonc` → `ai`), bật 18/10/2026 cho chép giọng nói. */
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

export const assistantApp = new Hono<{ Bindings: AiEnv }>();

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

async function modes(env: AiEnv): Promise<{ transcribe: Mode; summary: Mode; siteLog: Mode }> {
  const fake = (name: string) =>
    env.AI_FAKE === '1' ||
    (env.AI_FAKE ?? '')
      .split(',')
      .map((v) => v.trim())
      .includes(name);
  const [t, s, l] = await Promise.all([
    switchOn(env, 'ai.transcribe_enabled'),
    switchOn(env, 'ai.survey_summary_enabled'),
    switchOn(env, 'ai.site_log_enabled'),
  ]);
  return {
    transcribe: fake('transcribe') ? 'fake' : t && env.AI ? 'on' : 'off',
    summary: fake('summary') ? 'fake' : s && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
    siteLog: fake('site_log') ? 'fake' : l && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
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

assistantApp.get('/status', async (c) => {
  if (!bearer(c)) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  return c.json(await modes(c.env));
});

// ---------------------------------------------------------------------------------------------
// Ghi âm → chữ
// ---------------------------------------------------------------------------------------------
assistantApp.post('/transcribe', async (c) => {
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
      transcript = await whisper(c.env, db, 'survey-audio', rec.storage_path as string);
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

  // `vad_filter` bỏ đoạn không có tiếng người, bộ lọc câu bịa bỏ câu kết video Whisper tự nghĩ
  // ra khi chỉ nghe tiếng ồn (gặp thật 18/10/2026). Còn rỗng thì nói thẳng là không nghe rõ —
  // không lưu câu bịa làm bản chép, không để ô trống trông như đã chép xong.
  if (mode !== 'fake' && !transcript) {
    const note =
      'Không nghe rõ lời nói — bấm «Nghe» để kiểm micro có thu được giọng không, ghi lại gần máy hơn, hoặc gõ tay.';
    await db
      .from('site_survey_recordings')
      .update({ transcript_status: 'loi', transcript_note: note })
      .eq('id', rec.id);
    return c.json({ error: note }, 422);
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
assistantApp.post('/survey-summary', async (c) => {
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
// Ghi âm nhật ký công trường → chữ → nháp các mục (Đợt 2 — 2B)
// ---------------------------------------------------------------------------------------------
/**
 * Chưa có mục nhật ký nào lúc gọi: người ghi nói xong, máy trả nháp lên biểu mẫu, người ghi sửa
 * rồi mới Lưu (mục nhật ký ghi qua REST như cũ, kèm `voice_path`). Không ghi gì vào `site_logs`
 * ở đây. Công tắc xếp mục tắt thì vẫn trả bản chép chữ — giao diện đưa nguyên vào ô Nội dung.
 */
assistantApp.post('/site-log-draft', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as {
    site_id?: string;
    audio_path?: string;
    seconds?: number | null;
    /** `transcript` = chỉ chép chữ, không xếp mục (phiếu bảo hành — 2F). */
    purpose?: 'site_log' | 'transcript';
  };
  if (!body.site_id || !body.audio_path) return c.json({ error: 'Thiếu đoạn ghi âm.' }, 400);
  if (!body.audio_path.startsWith(`${body.site_id}/`)) {
    return c.json({ error: 'Đoạn ghi âm không thuộc công trình này.' }, 400);
  }

  const db = await asUser(c.env, token);
  const { data: writable } = await db.rpc('rls_site_writable', { p_site_id: body.site_id });
  if (!writable) {
    return c.json({ error: 'Chỉ người được phân công ở công trình này ghi được nhật ký.' }, 403);
  }
  const { data: site } = await db
    .from('construction_sites')
    .select('company_id')
    .eq('id', body.site_id)
    .single();
  const m = await modes(c.env);
  if (m.transcribe === 'off') return c.json({ error: OFF_MESSAGE }, 409);
  const user = await actorId(db);
  const base = {
    company_id: (site?.company_id as string | undefined) ?? null,
    user_id: user,
    entity_type: 'construction_sites',
    entity_id: body.site_id,
  };

  // 1) Chép chữ.
  let transcript: string;
  if (m.transcribe === 'fake') {
    transcript =
      body.purpose === 'transcript'
        ? `[Giả lập${body.seconds ? ` (${body.seconds} giây ghi âm)` : ''}] Chủ nhà báo trần phòng ngủ tầng ba bị thấm một vệt khoảng nửa mét sau trận mưa tối qua, gần góc cửa sổ, nhờ bên mình qua xem trong tuần này.`
        : fakeSiteLogTranscript(body.seconds ?? null);
    await logCall(c.env, {
      ...base,
      feature: 'transcribe',
      provider: 'gia_lap',
      model: null,
      is_fake: true,
      ok: true,
    });
  } else {
    try {
      transcript = await whisper(c.env, db, 'site-log-audio', body.audio_path);
      const minutes = Math.max(1, Math.ceil((body.seconds ?? 60) / 60));
      await logCall(c.env, {
        ...base,
        feature: 'transcribe',
        provider: 'cloudflare',
        model: WHISPER_MODEL,
        is_fake: false,
        input_units: minutes,
        cost_usd: minutes * WHISPER_USD_PER_MINUTE,
        ok: true,
      });
    } catch (e) {
      await logCall(c.env, {
        ...base,
        feature: 'transcribe',
        provider: 'cloudflare',
        model: WHISPER_MODEL,
        is_fake: false,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return c.json(
        { error: 'Chuyển giọng nói thành chữ không thành. Gõ tay nội dung thay thế.' },
        502,
      );
    }
    if (!transcript) {
      return c.json(
        {
          error:
            'Không nghe rõ lời nói — nói gần máy hơn rồi ghi lại, hoặc gõ tay. Đoạn ghi âm vẫn được giữ.',
        },
        422,
      );
    }
  }

  // 2) Xếp mục. Tắt / hỏng / chỉ cần chữ thì trả bản chép chữ, không chặn người ghi.
  const transcriptFake = m.transcribe === 'fake';
  if (m.siteLog === 'off' || body.purpose === 'transcript') {
    return c.json({ transcript, draft: null, fake: transcriptFake });
  }
  let draft: SiteLogVoiceDraft;
  if (m.siteLog === 'fake') {
    draft = fakeSiteLogDraft(transcript);
    await logCall(c.env, {
      ...base,
      feature: 'site_log_draft',
      provider: 'gia_lap',
      model: null,
      is_fake: true,
      ok: true,
    });
  } else {
    try {
      const result = await geminiSiteLog(c.env.GEMINI_PAID_API_KEY!, transcript);
      draft = result.draft;
      await logCall(c.env, {
        ...base,
        feature: 'site_log_draft',
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
        feature: 'site_log_draft',
        provider: 'gemini_paid',
        model: SUMMARY_MODEL,
        is_fake: false,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return c.json({
        transcript,
        draft: null,
        fake: transcriptFake,
        warning: 'Máy chưa xếp được mục — bản chép chữ đã đưa vào ô Nội dung, sửa lại rồi lưu.',
      });
    }
  }
  return c.json({ transcript, draft, fake: transcriptFake || m.siteLog === 'fake' });
});

// ---------------------------------------------------------------------------------------------

/** Tải tệp ghi âm dưới quyền người gọi rồi chép chữ; câu Whisper tự bịa đã gỡ. */
async function whisper(env: AiEnv, db: UserDb, bucket: string, path: string): Promise<string> {
  const file = await db.storage.from(bucket).download(path);
  if (file.error || !file.data) throw new Error('Không đọc được tệp ghi âm.');
  const audio = btoa(
    Array.from(new Uint8Array(await file.data.arrayBuffer()), (b) => String.fromCharCode(b)).join(
      '',
    ),
  );
  const out = (await env.AI!.run(WHISPER_MODEL, {
    audio,
    language: 'vi',
    vad_filter: true,
  })) as { text?: string };
  // Câu kết video Whisper tự bịa khi không nghe ra lời → gỡ (`whisper-hallucination.ts`).
  return stripWhisperHallucinations((out.text ?? '').trim());
}

async function geminiSiteLog(
  key: string,
  transcript: string,
): Promise<{ draft: SiteLogVoiceDraft; inputTokens: number; outputTokens: number }> {
  const prompt = [
    'Bạn là trợ lý của chỉ huy trưởng công trường xây dựng ở Việt Nam.',
    'Dưới đây là bản chép chữ lời chỉ huy trưởng nói nhật ký trong ngày. Xếp vào các mục:',
    'work_done (việc đã làm, khối lượng, vị trí), materials (vật tư về / dùng / thiếu),',
    'issues (vướng mắc, chậm, cần ai xử lý), safety (an toàn lao động, sự cố),',
    'weather (thời tiết), workforce_count (tổng số người có mặt, số nguyên).',
    'CHỈ dùng điều đã được nói; mục không được nhắc tới để chuỗi rỗng, workforce_count để null.',
    'Không bịa số liệu, không suy đoán. Giữ nguyên số, tên hạng mục, tên người. Viết tiếng Việt,',
    'ngắn gọn, mỗi ý một dòng bắt đầu bằng «- » khi có nhiều ý.',
    '',
    transcript,
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: {
      ...Object.fromEntries(SITE_LOG_DRAFT_SECTIONS.map(([k]) => [k, { type: 'STRING' }])),
      weather: { type: 'STRING' },
      workforce_count: { type: 'INTEGER', nullable: true },
    },
    required: [...SITE_LOG_DRAFT_SECTIONS.map(([k]) => k), 'weather', 'workforce_count'],
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
          temperature: 0.1,
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
  return {
    draft: normalizeSiteLogDraft(JSON.parse(text)),
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** Lời nói MẪU của chỉ huy trưởng — ghi rõ giả lập để không ai lẫn với nhật ký thật. */
function fakeSiteLogTranscript(seconds: number | null): string {
  const length = seconds ? ` (${seconds} giây ghi âm)` : '';
  return [
    `[Giả lập${length}] Hôm nay trời nắng, chiều có mưa nhỏ khoảng nửa tiếng. Có mười hai anh em,`,
    'tổ cốp pha sáu người, tổ thép bốn người, hai người phụ. Làm xong cốp pha dầm sàn tầng hai trục',
    'một đến bốn, buộc thép được khoảng bảy mươi phần trăm. Về hai tấn thép phi mười sáu, còn thiếu',
    'đinh và dây buộc. Vướng là cửa sổ mặt tiền chủ nhà muốn đổi kích thước, cần thiết kế chốt trước',
    'thứ năm. An toàn bình thường, nhắc anh em đeo dây khi làm ở mép sàn.',
  ].join(' ');
}

/** Nháp MẪU — lời nói mẫu ra đủ các mục; lời nói thật (chỉ giả lập phần xếp) vào «Việc đã làm». */
function fakeSiteLogDraft(transcript: string): SiteLogVoiceDraft {
  if (!transcript.startsWith('[Giả lập')) {
    return {
      work_done: `[Giả lập] ${transcript.slice(0, 300)}${transcript.length > 300 ? '…' : ''}`,
      materials: '',
      issues: '',
      safety: '',
      weather: '',
      workforce_count: null,
    };
  }
  return {
    work_done:
      '[Giả lập]\n- Xong cốp pha dầm sàn tầng 2, trục 1–4\n- Buộc thép dầm sàn tầng 2 khoảng 70%',
    materials: '- Về 2 tấn thép phi 16\n- Còn thiếu đinh và dây buộc',
    issues: '- Chủ nhà muốn đổi kích thước cửa sổ mặt tiền — cần Thiết kế chốt trước thứ Năm',
    safety: '- Bình thường; đã nhắc đeo dây an toàn khi làm ở mép sàn',
    weather: 'Nắng, chiều mưa nhỏ khoảng 30 phút',
    workforce_count: 12,
  };
}

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
