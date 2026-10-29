/**
 * Khối nền K1 — ghi âm → chữ → nháp AI cho các bộ phận (Đợt 1 — 1D, doc/KE_HOACH_LAM_HO.md).
 *
 * Ba tuyến, mọi tuyến chạy DƯỚI PHIÊN NGƯỜI GỌI (`asUser`) nên RLS quyết ai đọc / ghi được gì:
 *   GET  /ai/status          — chức năng nào đang tắt / giả lập / chạy thật (giao diện ẩn nút)
 *   POST /ai/transcribe      — một đoạn ghi âm khảo sát → chữ (Cloudflare Workers AI Whisper)
 *   POST /ai/survey-summary  — chữ của các đoạn ghi âm → nháp 6 ô báo cáo (Gemini Flash trả phí)
 *   POST /ai/site-log-draft  — một đoạn ghi âm nhật ký công trường → chữ → nháp các mục (Đợt 2 — 2B);
 *                              `purpose: 'transcript'` chỉ chép chữ (lời khách báo bảo hành — 2F)
 *   POST /ai/design-transcribe — một đoạn ghi âm của Thiết kế (khảo sát, ý kiến khách) → chữ (5A)
 *   POST /ai/brief-prefill   — khảo sát thiết kế + khảo sát CRM đã duyệt → ĐỀ XUẤT câu trả lời đầu bài
 *                              (không ghi gì; kiến trúc sư chọn rồi áp vào bản nháp — `brief-prefill.ts`)
 *   POST /ai/survey-paper-read — ảnh phiếu khảo sát giấy ĐÃ CHE khung thông tin khách → NHÁP sáu ô báo
 *                              cáo + ô phiếu riêng (không ghi gì; người khảo sát chọn, sửa, tự Lưu —
 *                              `survey-paper-read.ts`)
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
import {
  aiBriefPrefillSchema,
  aiSurveyPaperReadSchema,
  normalizePrefill,
  type AiBriefPrefillSuggestion,
  type AiSurveyPaperRead,
} from '@nvg/shared/design';
import { filledSiteDetails, surveyPaperFields } from '@nvg/shared';
import { readEffectiveBriefForm } from '../design/brief/form-config';
import {
  customerIdentities,
  fakePrefill,
  prefillDocument,
  prefillPrompt,
  PREFILL_RESPONSE_SCHEMA,
  type PrefillSources,
} from './brief-prefill';
import {
  fakePaperRead,
  normalizePaperRead,
  normalizePaperSketchRead,
  PAPER_RESPONSE_SCHEMA,
  paperIdentities,
  paperPrompt,
  parsePaperPages,
  type PaperPage,
} from './survey-paper-read';

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
// Khoá trả phí mới (28/10/2026) thuộc project mới: Google không mở `gemini-2.5-flash` cho người dùng mới (404) — cùng
// lý do `kb_label_normalize` đã chuyển sang 3.8-flash. Khoá cũ nằm ở project chưa bật thanh toán (Free Tier).
const SUMMARY_MODEL = 'gemini-3.8-flash';
/** Workers AI tính theo phút âm thanh — mức công bố, chỉ để ghi sổ, không dùng để chặn. */
const WHISPER_USD_PER_MINUTE = 0.0005;
/** Gemini 3.8 Flash gói trả phí, USD / 1 triệu token (vào / ra) — giá ưu đãi tới 31/12/2026 (config/models.yaml); chỉ để ghi sổ. */
const GEMINI_USD_PER_MTOK = { input: 0.75, output: 3.75 };

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

async function modes(env: AiEnv): Promise<{
  transcribe: Mode;
  summary: Mode;
  siteLog: Mode;
  briefPrefill: Mode;
  surveyPaper: Mode;
}> {
  const fake = (name: string) =>
    env.AI_FAKE === '1' ||
    (env.AI_FAKE ?? '')
      .split(',')
      .map((v) => v.trim())
      .includes(name);
  const [t, s, l, b, p] = await Promise.all([
    switchOn(env, 'ai.transcribe_enabled'),
    switchOn(env, 'ai.survey_summary_enabled'),
    switchOn(env, 'ai.site_log_enabled'),
    switchOn(env, 'ai.brief_prefill_enabled'),
    switchOn(env, 'ai.survey_paper_read_enabled'),
  ]);
  return {
    transcribe: fake('transcribe') ? 'fake' : t && env.AI ? 'on' : 'off',
    summary: fake('summary') ? 'fake' : s && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
    siteLog: fake('site_log') ? 'fake' : l && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
    briefPrefill: fake('brief_prefill') ? 'fake' : b && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
    surveyPaper: fake('survey_paper') ? 'fake' : p && env.GEMINI_PAID_API_KEY ? 'on' : 'off',
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
// Ghi âm của Thiết kế → chữ (Đợt 5 — 5A): lời chủ nhà lúc khảo sát, ý kiến khách từng vòng
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// Khảo sát → đề xuất câu trả lời đầu bài thiết kế (anh Dũng 27/10/2026)
// ---------------------------------------------------------------------------------------------
/**
 * Đọc mọi nguồn qua RLS của người gọi: khảo sát CRM người gọi không xem được thì đơn giản là không có, và màn
 * hình nói rõ. Người gọi phải sửa được hồ sơ thiết kế (đề xuất chỉ có ích cho người điền đầu bài). Không ghi gì.
 */
assistantApp.post('/brief-prefill', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { project_id?: string };
  if (!body.project_id) return c.json({ error: 'Thiếu hồ sơ thiết kế.' }, 400);

  const db = await asUser(c.env, token);
  const { data: writable } = await db.rpc('rls_design_project_writable', {
    p_project_id: body.project_id,
  });
  if (!writable) {
    return c.json(
      { error: 'Chỉ người sửa được hồ sơ thiết kế này mới điền sẵn được đầu bài.' },
      403,
    );
  }

  const mode = (await modes(c.env)).briefPrefill;
  if (mode === 'off') {
    return c.json(
      {
        error:
          'Chức năng điền sẵn đầu bài chưa bật — điền tay như thường. Quản trị bật ở trang Trợ lý AI khi chủ dự án duyệt chi phí.',
      },
      409,
    );
  }

  const [{ data: project }, { data: surveys }, { data: recs }, { data: brief }] = await Promise.all(
    [
      db
        .from('design_projects')
        .select('id, company_id, opportunity_id, customer:customers(name, phone, address)')
        .eq('id', body.project_id)
        .maybeSingle(),
      db
        .from('design_surveys')
        .select(
          'land_width, land_depth, land_area, orientation, measurement_notes, surrounding_notes, usage_notes, notes, surveyed_at, created_at',
        )
        .eq('design_project_id', body.project_id)
        .is('deleted_at', null)
        .order('surveyed_at', { ascending: false, nullsFirst: false })
        .limit(1),
      db
        .from('design_survey_recordings')
        .select('transcript, created_at')
        .eq('design_project_id', body.project_id)
        .eq('transcript_status', 'xong')
        .order('created_at', { ascending: true }),
      db
        .from('design_briefs')
        .select('design_task, functional_needs, style_note, site_condition')
        .eq('design_project_id', body.project_id)
        .eq('is_current_version', true)
        .is('deleted_at', null)
        .maybeSingle(),
    ],
  );
  if (!project) return c.json({ error: 'Không tìm thấy hồ sơ thiết kế.' }, 404);

  // Báo cáo khảo sát CRM ĐÃ DUYỆT của cơ hội gắn với hồ sơ — qua RLS của người gọi.
  let crm: PrefillSources['crm'] = null;
  const opportunityId = (project as { opportunity_id?: string | null }).opportunity_id;
  if (opportunityId) {
    const { data: site } = await db
      .from('site_surveys')
      // `site_surveys` không có `company_id` — mã pháp nhân (chọn bộ ô phiếu riêng) lấy qua cơ hội.
      .select('needs, notes, site_details, opportunity:opportunities(company:companies(code))')
      .eq('opportunity_id', opportunityId)
      .eq('report_status', 'da_duyet')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (site) {
      const row = site as unknown as {
        needs: string | null;
        notes: string | null;
        site_details: Record<string, unknown> | null;
        opportunity: { company: { code?: string } | null } | null;
      };
      crm = {
        needs: row.needs,
        notes: row.notes,
        details: filledSiteDetails(row.opportunity?.company?.code, row.site_details),
      };
    }
  }

  const sources: PrefillSources = {
    designSurvey: ((surveys ?? [])[0] ?? null) as PrefillSources['designSurvey'],
    transcripts: (recs ?? []).map((r) => (r.transcript as string) ?? '').filter(Boolean),
    legacy: (brief ?? null) as PrefillSources['legacy'],
    crm,
  };
  const customer = (
    project as { customer?: { name?: string; phone?: string; address?: string } | null }
  ).customer;
  const document = prefillDocument(sources, customerIdentities(customer));
  const used = {
    design_survey: sources.designSurvey !== null,
    transcripts: sources.transcripts.length,
    crm_survey: crm !== null,
    crm_linked: Boolean(opportunityId),
  };
  if (!document) {
    return c.json(
      {
        error:
          'Chưa có gì để đọc: hồ sơ chưa có biên bản khảo sát, ghi âm đã chép chữ hay báo cáo khảo sát đã duyệt của Kinh doanh.',
      },
      400,
    );
  }

  const form = await readEffectiveBriefForm(db);
  const user = await actorId(db);
  const base = {
    company_id: (project as { company_id: string }).company_id,
    user_id: user,
    feature: 'brief_prefill',
    entity_type: 'design_projects',
    entity_id: body.project_id,
  };

  let suggestions: AiBriefPrefillSuggestion[];
  if (mode === 'fake') {
    suggestions = fakePrefill(sources);
    await logCall(c.env, { ...base, provider: 'gia_lap', model: null, is_fake: true, ok: true });
  } else {
    try {
      const result = await geminiBriefPrefill(
        c.env.GEMINI_PAID_API_KEY!,
        prefillPrompt(form.config, document),
      );
      suggestions = result.suggestions;
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
      // 503 / 429 = Gemini đang quá tải (gặp thật 27/10/2026), lượt hỏng không tính tiền — nói người dùng thử lại.
      const busy = e instanceof Error && /Gemini trả (503|429)/.test(e.message);
      return c.json(
        {
          error: busy
            ? 'Dịch vụ AI đang quá tải. Thử lại sau ít phút, hoặc điền tay đầu bài như thường.'
            : 'Máy chưa đọc được khảo sát. Điền tay đầu bài như thường.',
        },
        502,
      );
    }
  }

  const { accepted, rejected } = normalizePrefill(form.config, suggestions);
  return c.json({ accepted, rejected, used, fake: mode === 'fake' });
});

// ---------------------------------------------------------------------------------------------
// Ảnh phiếu khảo sát giấy (đã che khung thông tin khách) → nháp sáu ô + ô phiếu riêng (28/10/2026)
// ---------------------------------------------------------------------------------------------
/**
 * Chạy dưới phiên người gọi: chỉ người viết được báo cáo (`rls_survey_writable` — người phụ trách cơ hội,
 * báo cáo đang Nháp / bị trả về) mới đọc được. Không ghi gì vào biên bản, không lưu ảnh: giao diện đưa
 * nháp vào biểu mẫu, người khảo sát sửa rồi tự Lưu. Bản PDF gốc trong kho vẫn là bằng chứng.
 */
assistantApp.post('/survey-paper-read', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { survey_id?: string; pages?: unknown };
  if (!body.survey_id) return c.json({ error: 'Thiếu biên bản khảo sát.' }, 400);

  const db = await asUser(c.env, token);
  const { data: writable } = await db.rpc('rls_survey_writable', { p_survey_id: body.survey_id });
  if (!writable) {
    const { data: row } = await db
      .from('site_surveys')
      .select('report_status')
      .eq('id', body.survey_id)
      .maybeSingle();
    const status = (row as { report_status?: string } | null)?.report_status;
    if (status === 'cho_duyet' || status === 'da_duyet') {
      return c.json(
        {
          error:
            'Báo cáo khảo sát đã gửi Ban Giám đốc nên không điền nháp được nữa. Ban Giám đốc trả về thì sửa tiếp.',
        },
        409,
      );
    }
    return c.json(
      { error: 'Chỉ người phụ trách cơ hội mới cho máy đọc phiếu của biên bản này.' },
      403,
    );
  }

  const mode = (await modes(c.env)).surveyPaper;
  if (mode === 'off') {
    return c.json(
      {
        error:
          'Chức năng máy đọc phiếu giấy chưa bật — gõ tay các ô như thường. Quản trị bật ở trang Trợ lý AI khi chủ dự án duyệt chi phí.',
      },
      409,
    );
  }

  const parsed = parsePaperPages(body.pages);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const { data: survey } = await db
    .from('site_surveys')
    .select(
      'id, opportunity:opportunities(company_id, company:companies(code), customer:customers(name, contact_person, representative_name, phone, email, address, tax_code))',
    )
    .eq('id', body.survey_id)
    .maybeSingle();
  if (!survey) return c.json({ error: 'Không tìm thấy biên bản khảo sát.' }, 404);
  const opp = (
    survey as unknown as {
      opportunity: {
        company_id: string;
        company: { code?: string } | null;
        customer: Parameters<typeof paperIdentities>[0];
      } | null;
    }
  ).opportunity;
  const companyCode = opp?.company?.code ?? null;
  const fields = surveyPaperFields(companyCode);
  const identities = paperIdentities(opp?.customer ?? null);
  const base = {
    company_id: opp?.company_id ?? null,
    user_id: await actorId(db),
    feature: 'survey_paper_read',
    entity_type: 'site_surveys',
    entity_id: body.survey_id,
  };

  let raw: AiSurveyPaperRead;
  if (mode === 'fake') {
    raw = fakePaperRead(companyCode);
    await logCall(c.env, { ...base, provider: 'gia_lap', model: null, is_fake: true, ok: true });
  } else {
    try {
      const result = await geminiPaperRead(
        c.env.GEMINI_PAID_API_KEY!,
        paperPrompt(fields),
        parsed.pages,
      );
      raw = result.read;
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
      const busy = e instanceof Error && /Gemini trả (503|429)/.test(e.message);
      return c.json(
        {
          error: busy
            ? 'Dịch vụ AI đang quá tải. Thử lại sau ít phút, hoặc gõ tay các ô như thường.'
            : 'Máy chưa đọc được phiếu. Gõ tay các ô như thường.',
        },
        502,
      );
    }
  }

  const { accepted, rejected } = normalizePaperRead(fields, raw, identities);
  const sketch = normalizePaperSketchRead(raw.sketch, parsed.pages.length, identities);
  return c.json({ accepted, rejected, sketch, fake: mode === 'fake' });
});

async function geminiPaperRead(
  key: string,
  prompt: string,
  pages: readonly PaperPage[],
): Promise<{ read: AiSurveyPaperRead; inputTokens: number; outputTokens: number }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...pages.map((p) => ({ inline_data: { mime_type: p.mime_type, data: p.data } })),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: PAPER_RESPONSE_SCHEMA,
          temperature: 0.1,
          // Chép chữ không cần suy luận dài; chặn trần để chi phí mỗi phiếu đoán được.
          thinkingConfig: { thinkingBudget: 512 },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini trả ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  // Kiểm theo hợp đồng: sai hình thì coi như lượt hỏng, không đoán. Riêng khung sơ đồ sai (toạ độ ngoài
  // 0–1, trang lạ) chỉ bỏ khung — chữ các ô vẫn dùng được.
  const body = JSON.parse(text) as Record<string, unknown>;
  let checked = aiSurveyPaperReadSchema.safeParse(body);
  if (!checked.success && body && typeof body === 'object' && 'sketch' in body) {
    delete body.sketch;
    checked = aiSurveyPaperReadSchema.safeParse(body);
  }
  const read = checked.success ? checked.data : aiSurveyPaperReadSchema.parse(body);
  return {
    read,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    // Token suy nghĩ tính tiền như token ra.
    outputTokens:
      (json.usageMetadata?.candidatesTokenCount ?? 0) +
      (json.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function geminiBriefPrefill(
  key: string,
  prompt: string,
): Promise<{ suggestions: AiBriefPrefillSuggestion[]; inputTokens: number; outputTokens: number }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: PREFILL_RESPONSE_SCHEMA,
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
  // Kiểm theo hợp đồng: sai hình thì coi như lượt hỏng, không đoán.
  const parsed = aiBriefPrefillSchema.parse(JSON.parse(text));
  return {
    suggestions: parsed.suggestions,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * Chỉ chép chữ, không tóm tắt. Tệp ở kho `design-audio`, thư mục đầu = dự án thiết kế; người gọi
 * phải sửa được hồ sơ thiết kế đó. Không ghi gì vào CSDL — giao diện đặt chữ vào ô để người ghi
 * đọc lại rồi tự lưu (ghi âm khảo sát: `design_survey_recordings.transcript`; ý kiến: ô Nội dung).
 */
assistantApp.post('/design-transcribe', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    audio_path?: string;
    seconds?: number | null;
  };
  if (!body.project_id || !body.audio_path) return c.json({ error: 'Thiếu đoạn ghi âm.' }, 400);
  if (!body.audio_path.startsWith(`${body.project_id}/`)) {
    return c.json({ error: 'Đoạn ghi âm không thuộc hồ sơ thiết kế này.' }, 400);
  }
  const db = await asUser(c.env, token);
  const { data: writable } = await db.rpc('rls_design_project_writable', {
    p_project_id: body.project_id,
  });
  if (!writable) {
    return c.json({ error: 'Chỉ Phòng Thiết kế phụ trách hồ sơ này ghi âm được.' }, 403);
  }
  const { data: project } = await db
    .from('design_projects')
    .select('company_id')
    .eq('id', body.project_id)
    .single();
  const m = await modes(c.env);
  if (m.transcribe === 'off') return c.json({ error: OFF_MESSAGE }, 409);
  const base = {
    company_id: (project?.company_id as string | undefined) ?? null,
    user_id: await actorId(db),
    entity_type: 'design_projects',
    entity_id: body.project_id,
  };

  if (m.transcribe === 'fake') {
    await logCall(c.env, {
      ...base,
      feature: 'transcribe',
      provider: 'gia_lap',
      model: null,
      is_fake: true,
      ok: true,
    });
    return c.json({
      transcript: `[Giả lập${body.seconds ? ` (${body.seconds} giây ghi âm)` : ''}] Chủ nhà muốn phòng thờ ở tầng trên cùng, phòng ngủ ông bà ở tầng một gần nhà vệ sinh; cầu thang dời ra phía sau để mặt tiền rộng hơn.`,
      fake: true,
    });
  }

  let transcript: string;
  try {
    transcript = await whisper(c.env, db, 'design-audio', body.audio_path);
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
  return c.json({ transcript, fake: false });
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
