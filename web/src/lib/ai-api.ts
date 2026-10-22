/**
 * Gọi khối nền AI của Worker (`/ai/*`, Đợt 1 — K1). Cùng máy chủ với «AI Design»
 * (`VITE_DESIGN_API_URL`), cùng cách xác thực: JWT của phiên hiện tại, Worker chạy dưới quyền
 * người gọi nên RLS quyết định ai đọc / ghi được gì.
 *
 * Máy chỉ làm NHÁP. AI tắt hay lỗi thì người dùng vẫn tự gõ được — mọi chỗ gọi phải có đường
 * đi tiếp khi hàm này ném lỗi (CLAUDE.md 5.1).
 */

import type { SiteLogVoiceDraft } from '@nvg/shared';
import { supabase } from './supabase';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

export type AiMode = 'off' | 'fake' | 'on';

export class AiApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiApiError('Phiên đăng nhập đã hết. Đăng nhập lại để tiếp tục.', 401);
  let res: Response;
  try {
    res = await fetch(`${BASE}/ai${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AiApiError(
      'Không kết nối được máy chủ AI. Gõ tay nội dung thay thế — các phần khác vẫn dùng bình thường.',
    );
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new AiApiError(json.error ?? 'Máy chủ AI không xử lý được yêu cầu.', res.status);
  }
  return json;
}

export function aiStatus(): Promise<{ transcribe: AiMode; summary: AiMode; siteLog: AiMode }> {
  return call('/status');
}

export function transcribeRecording(
  recordingId: string,
): Promise<{ transcript: string; fake: boolean }> {
  return call('/transcribe', { method: 'POST', body: { recording_id: recordingId } });
}

export interface SurveyAiDraft {
  needs: string;
  decision_maker: string;
  budget_note: string;
  schedule_note: string;
  commercial_terms: string;
  notes: string;
}

export function summarizeSurvey(
  surveyId: string,
): Promise<{ draft: SurveyAiDraft; fake: boolean }> {
  return call('/survey-summary', { method: 'POST', body: { survey_id: surveyId } });
}

/**
 * Đoạn ghi âm nhật ký công trường (đã tải lên kho `site-log-audio`) → chữ + nháp các mục (2B).
 * `draft` = `null` khi công tắc xếp mục tắt hoặc máy xếp hỏng — dùng nguyên `transcript`.
 */
/**
 * Đoạn ghi âm của Thiết kế (kho `design-audio`, thư mục đầu = dự án) → chữ (5A): lời chủ nhà lúc
 * khảo sát, ý kiến khách từng vòng. Chỉ chép chữ; người ghi đọc lại rồi tự lưu.
 */
export function transcribeDesignAudio(input: {
  projectId: string;
  audioPath: string;
  seconds: number | null;
}): Promise<{ transcript: string; fake: boolean }> {
  return call('/design-transcribe', {
    method: 'POST',
    body: { project_id: input.projectId, audio_path: input.audioPath, seconds: input.seconds },
  });
}

export function draftSiteLog(input: {
  siteId: string;
  audioPath: string;
  seconds: number | null;
  /** `transcript` = chỉ chép chữ, không xếp mục nhật ký. */
  purpose?: 'site_log' | 'transcript';
}): Promise<{
  transcript: string;
  draft: SiteLogVoiceDraft | null;
  fake: boolean;
  warning?: string;
}> {
  return call('/site-log-draft', {
    method: 'POST',
    body: {
      site_id: input.siteId,
      audio_path: input.audioPath,
      seconds: input.seconds,
      purpose: input.purpose ?? 'site_log',
    },
  });
}
