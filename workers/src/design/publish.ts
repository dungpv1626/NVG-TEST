/**
 * Cầu nối phát hành — ĐIỂM GIAO DUY NHẤT giữa artifact và hệ quản lý tài liệu sẵn có.
 *
 * Nguồn: doc/design/03-data-contracts.md mục 3.8b.
 *
 * Bốn quy tắc, tất cả đều cưỡng chế được chứ không phải quy ước:
 *
 *  1. MỘT lần phát hành mang ĐÚNG MỘT bộ môn. Ký gộp là không kiểm được ai chịu trách nhiệm
 *     phần nào.
 *  2. Người ký phải có `design.publish.<bộ môn>` — kiến trúc sư không ký được hồ sơ kết cấu
 *     kể cả khi là trưởng phòng. Kiểm ở RLS (`design_publication_insert`), không ở đây; hàm
 *     này chỉ tránh đi tới bước cuối rồi mới báo lỗi khó hiểu.
 *  3. Số phiên bản do HỆ TÀI LIỆU cấp (`publish_document_version`), module không tự đặt.
 *  4. Phát hành là MỘT CHIỀU. Sửa tài liệu bên kia không đẩy ngược vào artifact.
 *
 * ⚠️ Hàm này chạy dưới phiên của NGƯỜI DÙNG, không dùng `service_role`: `publish_document_version`
 * là `SECURITY INVOKER` để giữ RLS, và cả ba lớp kiểm quyền phải nhìn thấy đúng người ký.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AI_DISCLAIMERS, type PublishRequest } from '@nvg/shared/design';
import { parseRequest } from './contracts';
import type { DesignEnv } from './env';

export interface PublishOutcome {
  publicationId: string;
  documentId: string;
  documentVersionId: string;
}

/**
 * Tên tệp theo quy ước NVG ngoài đời: `NVO026_NhaAnhA_KT_MatBang_V03_11082026`.
 *
 * ⚠️ Quy ước này KHÁC mã hồ sơ trong hệ thống (`NVO-TK-2026-0001`) — cố ý, và đang chờ Haan
 * xác nhận (câu hỏi Q-7). Phần số phiên bản do hệ tài liệu cấp nên hàm này nhận vào chứ
 * không tự tính.
 */
export function buildFileName(args: {
  projectCode: string;
  projectName: string;
  disciplineAbbr: 'KT' | 'KC' | 'DN';
  documentName: string;
  version: number;
  publishedAt: Date;
}): string {
  const d = args.publishedAt;
  const stamp =
    String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getFullYear());
  return [
    args.projectCode.replace(/[^A-Za-z0-9]/g, ''),
    slug(args.projectName),
    args.disciplineAbbr,
    slug(args.documentName),
    `V${String(args.version).padStart(2, '0')}`,
    stamp,
  ].join('_');
}

/** Bỏ dấu tiếng Việt và ghép chữ hoa đầu — tên tệp phải mở được trên mọi máy, kể cả Windows cũ. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

const DISCIPLINE_ABBR = {
  kien_truc: 'KT',
  ket_cau: 'KC',
  dien_nuoc: 'DN',
} as const;

export class PublishBridge {
  private readonly db: SupabaseClient;

  /** `accessToken` là JWT của chính người ký — RLS phải nhìn thấy đúng người đó. */
  constructor(env: DesignEnv, accessToken: string) {
    this.db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  async publish(rawRequest: unknown): Promise<PublishOutcome> {
    const request: PublishRequest = parseRequest('publish_request', rawRequest);

    const project = await this.db
      .from('design_projects')
      .select('id, code, name, company_id')
      .eq('id', request.project_id)
      .single();
    if (project.error) {
      throw new Error('Không tìm thấy dự án thiết kế, hoặc không có quyền truy cập.');
    }

    // Một tài liệu logic cho mỗi (dự án × bộ môn): các lần phát hành sau là PHIÊN BẢN của
    // cùng tài liệu, không phải tài liệu mới. Tạo tài liệu mới mỗi lần là làm mất chính thứ
    // NEN-05 sinh ra để giữ — "bản nào đang hiệu lực".
    const documentId = await this.ensureDocument(request, project.data);

    const versionName = request.documents[0]?.name ?? 'HoSo';
    const fileUri = request.documents[0]?.uri ?? '';

    const published = await this.db.rpc('publish_document_version', {
      p_document_id: documentId,
      p_file_url: fileUri,
      p_file_name: versionName,
      p_change_reason: request.change_reason ?? null,
      p_mime_type: request.documents[0]?.mime_type ?? null,
    });
    if (published.error) throw new Error(published.error.message);

    const publication = await this.db
      .from('design_publication')
      .insert({
        tenant_id: request.tenant_id,
        company_id: project.data.company_id,
        project_id: request.project_id,
        discipline: request.discipline,
        artifact_ids: request.artifact_ids,
        document_id: documentId,
        document_version_id: published.data as string,
        signed_by: request.signed_by,
        signed_at: request.signed_at ?? new Date().toISOString(),
      })
      .select('id')
      .single();

    if (publication.error) {
      // RLS chặn ở đây nghĩa là người ký không có quyền của bộ môn này. Nói rõ AI XỬ LÝ ĐƯỢC,
      // không chỉ "không đủ quyền" (CGD 5.5).
      throw new Error(
        `Không phát hành được hồ sơ bộ môn ${DISCIPLINE_ABBR[request.discipline]}: ` +
          'người ký phải là người chịu trách nhiệm chuyên môn của bộ môn này. ' +
          'Liên hệ Trưởng phòng Thiết kế để được phân công, hoặc Quản trị hệ thống để cấp quyền ký.',
      );
    }

    return {
      publicationId: publication.data.id as string,
      documentId,
      documentVersionId: published.data as string,
    };
  }

  private async ensureDocument(
    request: PublishRequest,
    project: { id: string; name: string; company_id: string },
  ): Promise<string> {
    const existing = await this.db
      .from('documents')
      .select('id')
      .eq('related_entity_type', 'design_projects')
      .eq('related_entity_id', project.id)
      .eq('category', `ban_ve_${request.discipline}`)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data.id as string;

    const created = await this.db
      .from('documents')
      .insert({
        company_id: project.company_id,
        title: `Hồ sơ ${DISCIPLINE_ABBR[request.discipline]} — ${project.name}`,
        category: `ban_ve_${request.discipline}`,
        related_entity_type: 'design_projects',
        related_entity_id: project.id,
        // Nhãn cảnh báo do MÃ NGUỒN chèn, không phụ thuộc người dùng nhớ bật (CLAUDE.md 8.7).
        description: `${AI_DISCLAIMERS.schedules} Hồ sơ sinh từ Module Thiết kế AI, truy ngược được về artifact nguồn.`,
      })
      .select('id')
      .single();
    if (created.error) throw new Error(created.error.message);
    return created.data.id as string;
  }
}
