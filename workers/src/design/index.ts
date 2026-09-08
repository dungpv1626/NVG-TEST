/**
 * API của Module Thiết kế AI — gắn vào Worker `nvg-api` dưới tiền tố `/design`.
 *
 * Vì sao module này CÓ lớp Workers trong khi CLAUDE.md 3.1 bảo phần lớn nghiệp vụ nên gọi
 * thẳng Supabase: nó thoả cả ba điều kiện của quy tắc đó cùng lúc — gọi dịch vụ bên ngoài
 * (mô hình ngôn ngữ, Container tính toán), ghi nhiều bảng phải toàn vẹn cùng lúc (artifact +
 * cạnh lineage + con trỏ bản hiệu lực), và có quy tắc nghiệp vụ vượt khả năng của RLS
 * (điều phối pipeline, chính sách hạng dữ liệu).
 *
 * Phần CRUD thường của module (danh sách dự án, xem đầu bài) vẫn gọi thẳng Supabase từ
 * `web/` như 12 module còn lại. Đừng thêm endpoint ở đây cho việc RLS đã đủ sức làm.
 */

import { Hono } from 'hono';
import {
  artifactId,
  BRIEF_FORM,
  DATA_CLASSES,
  type DataClass,
  type DesignBrief,
  type SpaceProgram,
} from '@nvg/shared/design';
import { ContractError } from './contracts';
import { createComputeBackend, type ExportDxfRequest } from './compute-backend';
import { DataClassViolation, ModelNotConfigured } from './llm/router';
import { geminiClient, modelRouter, renderImageClient, textClientFor } from './llm/factory';
import { aiModelCatalogue, isSelectableRoute } from './ai/models';
import { aiPrompts } from './ai/prompts-data';
import { AiProgramRejected, generateAiProgram } from './ai/program';
import { compareProgramsById } from './ai/compare';
import { recordAiCall } from './ai/call-log';
import { AI_DIGEST_DATA_CLASS, anonymiseForAi, type AnonymiseInput } from './brief/anonymise';
import { spaceNorms } from './program/norms-data';
import { plausibilityRules } from './program/plausibility-data';
import { LlmCallFailed } from './llm/gemini';
import { PublishBridge } from './publish';
import { ArtifactRepository } from './artifacts';
import { createArtifactStore } from './artifact-store';
import { buildBriefPayload } from './brief/payload';
import { gateLayer2, readCompletenessThreshold } from './brief/gate';
import { runLayer2 } from './program/run';
import { retrieveFewShots } from './kb/retrieve';
import { roomVocabulary } from './kb/vocabulary-data';
import { embeddingText, withheldFields, type RationalePayload } from './kb/rationale';
import { createSourceFileStore, type StoredSource } from './source-files';
import type { DigitiseParams, DigitiseSource } from './workflows/digitise-steps';
import { extractSiteBoundary } from './site/extract-boundary';
import { describeSite, parseImageDataUrl, renderFromMassing } from './render/render';
import type { RenderSite } from './render/render';
import { siteFaces } from './layout/site-context';
import { renderPrompts } from './render/prompts-data';
import { siteContextTable } from './layout/site-context-data';
import { roomGroups } from './kb/vocabulary';
import { spaceLabels } from './layout/labels';
import {
  chooseVariant,
  generateVariants,
  listVariants,
  VariantsPrerequisiteMissing,
  type VariantContext,
} from './layout/variants';
import { ruleCatalogue } from './layout/summary';
import { rulePackFor } from './program/rule-pack-data';
import type { DesignEnv } from './env';

export const designApp = new Hono<{ Bindings: DesignEnv }>();

/**
 * Kiểm tra sống của cả hai runtime.
 *
 * Trả riêng trạng thái lớp tính toán vì đó là thứ hay tắt nhất trong giai đoạn dev (Container
 * chạy bằng Docker tại chỗ) — biết ngay còn hơn để pipeline chạy tới bước 4 mới đứng.
 */
designApp.get('/health', async (c) => {
  const compute = createComputeBackend(c.env);
  return c.json({
    ok: true,
    module: 'design',
    compute: { backend: compute.name, ...(await compute.health()) },
    models: { version: modelRouter(c.env).version },
  });
});

/**
 * Chính sách hạng dữ liệu — cho giao diện biết trước lời gọi nào bị chặn.
 *
 * Không thay thế lớp chặn: `ModelRouter.resolve` vẫn kiểm lại ở đúng thời điểm gọi. Đây chỉ
 * là để không hiện nút rồi mới báo lỗi (AFD 6.5).
 */
designApp.get('/policy/data-class', (c) => {
  const router = modelRouter(c.env);
  const routes = ['layer1_brief', 'layer2_program', 'layer3_intent', 'layer4_facade'];
  return c.json({
    routes: Object.fromEntries(
      routes.map((name) => [
        name,
        Object.fromEntries(DATA_CLASSES.map((dc) => [dc, router.allows(name, dc as DataClass)])),
      ]),
    ),
  });
});

/**
 * Danh mục model cho ô chọn của trang thiết kế (nhánh AI, T10).
 *
 * Trả TÊN TUYẾN kèm nhãn — không bao giờ trả khoá. Tuyến bật mà chưa có khoá vẫn được liệt kê
 * kèm lý do để giao diện mờ nó và nói vì sao (AFD 6.5). Mặc định đọc từ `design_setting` của
 * tenant qua RLS của chính người gọi, nên không cần truyền mã dự án.
 */
designApp.get('/ai/models', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const db = await asUser(c.env, token);

  const catalogue = aiModelCatalogue(modelRouter(c.env));
  const settings = await db
    .from('design_setting')
    .select('key, value')
    .in('key', ['ai_text_route_default', 'ai_image_route_default']);
  // Danh mục không phụ thuộc RLS, nên phải tự chặn token hỏng: PostgREST trả 401 thì người gọi
  // chưa đăng nhập, không phải "tenant chưa cấu hình mặc định".
  if (settings.error && settings.status === 401) {
    return c.json({ error: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi mở lại trang.' }, 401);
  }
  const valueOf = (key: string): string | null => {
    const row = (settings.data ?? []).find((r) => r.key === key);
    return typeof row?.value === 'string' ? row.value : null;
  };
  // Mặc định chỉ có nghĩa khi nó trỏ vào một tuyến đang bấm được; không thì để trình duyệt
  // chọn tuyến bật đầu tiên — đừng trỏ người dùng vào một lựa chọn mờ.
  const pickDefault = (kind: 'text' | 'image', key: string) => {
    const wanted = valueOf(key);
    const usable = catalogue[kind].filter((o) => o.enabled);
    return usable.find((o) => o.route === wanted)?.route ?? usable[0]?.route ?? null;
  };
  return c.json({
    ...catalogue,
    defaults: {
      text: pickDefault('text', 'ai_text_route_default'),
      image: pickDefault('image', 'ai_image_route_default'),
    },
  });
});

/** Phát hành hồ sơ một bộ môn sang hệ tài liệu. Chạy dưới phiên của chính người ký. */
designApp.post('/publish', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const bridge = new PublishBridge(c.env, token);
  const outcome = await bridge.publish(await c.req.json());
  return c.json(outcome, 201);
});

/**
 * Số hoá một bộ hồ sơ cũ — nhận nhiều bản vẽ, khởi động Workflow, trả mã lượt chạy.
 *
 * Quyền được hỏi CHÍNH CƠ SỞ DỮ LIỆU (`rls_kb_writable`) dưới phiên của người gọi, thay vì
 * chép lại điều kiện ở đây. Nếu viết lại ở tầng Worker thì có hai bản quy tắc sẽ lệch nhau,
 * mà bản trong CSDL mới là bản không vòng qua được (CLAUDE.md 3.4).
 *
 * Endpoint trả về NGAY sau khi lưu tệp và khởi động Workflow: trích một bộ hồ sơ mất hàng
 * chục giây, giữ kết nối chờ là cách chắc chắn để gặp hết giờ ở tầng mạng.
 */
designApp.post('/kb/digitise', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  if (!c.env.DIGITISE_PIPELINE) {
    return c.json(
      {
        error:
          'Chưa cấu hình luồng số hoá. Workflow chỉ chạy trong runtime Workers — dùng `wrangler dev` thay vì gọi trực tiếp.',
        retryable: false,
      },
      503,
    );
  }

  const form = await c.req.formData();
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') {
    return c.json({ error: 'Thiếu phần `meta` mô tả bộ hồ sơ.' }, 400);
  }

  const meta = JSON.parse(rawMeta) as Omit<DigitiseParams, 'sources'> & { levels?: number[] };
  const discipline = meta.discipline ?? 'kien_truc';

  const { createClient } = await import('@supabase/supabase-js');
  const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const allowed = await asUser.rpc('rls_kb_writable', {
    p_tenant_id: meta.tenantId,
    p_discipline: discipline,
  });
  if (allowed.error) return c.json({ error: 'Không kiểm tra được quyền số hoá hồ sơ.' }, 500);
  if (allowed.data !== true) {
    // Nêu rõ AI xử lý được, không chỉ "không đủ quyền" (CGD 5.5).
    return c.json(
      {
        error: `Không đủ quyền số hoá hồ sơ bộ môn này. Việc này do người có quyền ghi hồ sơ ${discipline} của Phòng Thiết kế thực hiện.`,
      },
      403,
    );
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return c.json({ error: 'Chưa chọn bản vẽ nào để số hoá.' }, 400);

  const store = createSourceFileStore(c.env);
  const stored: StoredSource[] = [];
  const sources: DigitiseSource[] = [];
  for (const [index, file] of files.entries()) {
    const saved = await store.put(file.name, new Uint8Array(await file.arrayBuffer()));
    stored.push(saved);
    sources.push({ uri: saved.uri, name: file.name, level: meta.levels?.[index] ?? index + 1 });
  }

  const params: DigitiseParams = { ...meta, discipline, sources };
  const run = await c.env.DIGITISE_PIPELINE.create({ params });

  return c.json({ runId: run.id, sources: stored }, 202);
});

/**
 * Client Supabase chạy dưới PHIÊN CỦA NGƯỜI GỌI.
 *
 * Khoá `service_role` chỉ đóng vai `apikey`; vai trò thật do JWT trong `Authorization` quyết
 * định, nên RLS vẫn áp dụng đầy đủ. Đây là điều phân biệt các tuyến "thay mặt người dùng" với
 * tuyến chạy nền (Workflow) vốn cố ý vượt RLS.
 */
async function asUser(env: DesignEnv, token: string) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Xác nhận đầu bài — đúc artifact `design_brief` bất biến.
 *
 * Vì sao đây là endpoint Workers chứ không phải một lệnh Supabase (CLAUDE.md 3.1): nó ghi
 * `design_artifact` + cạnh lineage + `design_head` phải toàn vẹn cùng lúc — điều kiện (b).
 * Phần đọc và lưu nháp đầu bài vẫn gọi thẳng Supabase từ trình duyệt, và nên giữ như vậy.
 *
 * Vì sao đúc lúc XÁC NHẬN chứ không phải mỗi lần lưu: `design_head` phải trỏ tới một đầu
 * bài người thật đã ký nhận. Đúc theo từng lần lưu sẽ nhồi kho artifact bằng các bản nháp
 * nửa vời và làm "đang hiệu lực" mất nghĩa.
 */
designApp.post('/brief/confirm', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { briefId?: string };
  if (!body.briefId) return c.json({ error: 'Thiếu mã đầu bài cần xác nhận.' }, 400);

  const db = await asUser(c.env, token);

  // Đọc qua RLS: người không được xem đầu bài thì cũng không đúc được artifact từ nó. Không
  // chép lại điều kiện quyền ở tầng Worker — bản trong CSDL mới là bản không vòng qua được.
  const brief = await db
    .from('design_briefs')
    .select(
      'id, company_id, design_project_id, structured, confirmed_at, is_current_version, ' +
        'project:design_projects!design_briefs_design_project_id_design_projects_id_fk(code, company_id)',
    )
    .eq('id', body.briefId)
    .is('deleted_at', null)
    .maybeSingle();

  if (brief.error) return c.json({ error: 'Không đọc được đầu bài cần xác nhận.' }, 500);
  if (!brief.data) {
    return c.json(
      {
        error:
          'Không tìm thấy đầu bài, hoặc tài khoản không được sửa hồ sơ thiết kế này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.',
      },
      404,
    );
  }
  // Quan hệ lồng làm suy kiểu của thư viện khách rối; khai tường minh hình dạng đã chọn.
  const row = brief.data as unknown as {
    company_id: string;
    design_project_id: string;
    structured: unknown;
    confirmed_at: string | null;
    is_current_version: boolean;
    project: { code: string; company_id: string };
  };

  if (!row.is_current_version) {
    return c.json({ error: 'Chỉ xác nhận được đầu bài đang hiệu lực.' }, 409);
  }
  if (row.confirmed_at) {
    return c.json({ error: 'Đầu bài này đã được xác nhận.' }, 409);
  }

  // Tenant suy từ pháp nhân, không bắt trình duyệt gửi: phạm vi tenant của một người ĐÃ được
  // xác định bởi các pháp nhân họ được gán (CLAUDE.md 8.8 điểm 4).
  const company = await db.from('companies').select('tenant_id').eq('id', row.company_id).single();
  if (company.error)
    return c.json({ error: 'Không xác định được phạm vi dữ liệu của hồ sơ.' }, 500);

  // Kiểm quyền GHI trước khi đúc: artifact và `design_head` ghi bằng `service_role`, còn
  // lệnh UPDATE `design_briefs` ở dưới mới đi qua RLS. Không kiểm ở đây thì người chỉ xem
  // được vẫn đổi head xong rồi mới bị chặn ở bước cuối — head trỏ vào bản chưa ai ký nhận.
  const denied = await denyUnlessWritable(
    db,
    company.data.tenant_id as string,
    row.design_project_id,
  );
  if (denied) return c.json({ error: denied.error }, denied.status);

  const actor = await db.rpc('auth_user_id');
  const built = buildBriefPayload({
    structured: row.structured,
    projectId: row.design_project_id,
    projectCode: row.project.code,
  });

  // Đúc artifact TRƯỚC khi đánh dấu xác nhận: hợp đồng thiếu trường bắt buộc thì dừng ở đây
  // với câu đọc được, và đầu bài vẫn ở trạng thái sửa được.
  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.write({
    scope: {
      tenantId: company.data.tenant_id as string,
      companyId: row.company_id,
      projectId: row.design_project_id,
      discipline: 'kien_truc',
      actorId: (actor.data as string | null) ?? null,
    },
    kind: 'design_brief',
    payload: built.payload,
    step: 'layer1_brief',
    params: { form_config_version: BRIEF_FORM.version },
    setHead: true,
  });

  // Một lệnh ghi duy nhất: điểm đã tính lại, dấu xác nhận và mã artifact cùng lúc. Tách ra
  // thì có ngày lệnh thứ hai hỏng và đầu bài mang dấu xác nhận với điểm cũ — mà lúc đó
  // trigger đóng băng đã có hiệu lực, không sửa lại được nữa.
  const saved = await db
    .from('design_briefs')
    .update({
      structured: built.payload,
      confirmed_at: new Date().toISOString(),
      confirmed_by: (actor.data as string | null) ?? null,
      artifact_id: artifact.id,
    })
    .eq('id', body.briefId)
    .select('id')
    .single();
  if (saved.error) {
    // Nguyên văn PostgREST là tiếng Anh và có thể mang tên trigger — chỉ ghi log (CGD 5.5).
    console.error('brief/confirm: không ghi được dấu xác nhận', saved.error);
    return c.json(
      {
        error:
          'Đã đúc đầu bài nhưng không ghi được dấu xác nhận. Tải lại trang rồi thử lại; nếu vẫn lỗi, báo Quản trị hệ thống.',
      },
      500,
    );
  }

  return c.json({
    artifactId: artifact.id,
    completenessScore: built.completenessScore,
    missingFields: built.missingFields,
    issues: built.issues,
  });
});

/**
 * Nhãn tiếng Việt của mã phòng, gửi kèm kết quả.
 *
 * Vì sao gửi từ máy chủ chứ không khai lại ở `web/`: từ vựng phòng là MỘT tệp dữ liệu
 * (`kb/room_vocabulary.yaml`). Khai bảng nhãn thứ hai trong trình duyệt thì thêm một loại
 * phòng phải sửa hai chỗ, và chỗ quên sửa hiện ra mã máy (`altar_room`) giữa màn hình tiếng
 * Việt — đúng thứ CLAUDE.md 4.1 cấm.
 */
function roomLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of roomVocabulary().vocabulary.types) out[type.code] = type.vi;
  return out;
}

/**
 * Đọc dự án dưới phiên người gọi và suy phạm vi dữ liệu từ đó.
 *
 * Đi qua RLS thay vì kiểm quyền lại ở tầng Worker: người không xem được hồ sơ thiết kế thì
 * cũng không lập được chương trình không gian cho nó, và chỉ có MỘT bản quy tắc quyền —
 * bản trong CSDL (CLAUDE.md 3.4).
 */
async function projectScope(
  db: Awaited<ReturnType<typeof asUser>>,
  projectId: string,
): Promise<{ companyId: string; tenantId: string; actorId: string | null } | null> {
  const project = await db
    .from('design_projects')
    .select('id, company_id')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (project.error || !project.data) return null;

  const companyId = project.data.company_id as string;
  const company = await db.from('companies').select('tenant_id').eq('id', companyId).single();
  if (company.error) return null;

  const actor = await db.rpc('auth_user_id');
  return {
    companyId,
    tenantId: company.data.tenant_id as string,
    actorId: (actor.data as string | null) ?? null,
  };
}

const DESIGN_WRITE_DENIED =
  'Không đủ quyền sửa hồ sơ kiến trúc của dự án này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.';

/**
 * Hỏi CSDL "người này có được GHI bộ môn này của dự án này không" — trước mọi lệnh ghi
 * artifact hay đổi `design_head`.
 *
 * Vì sao phải hỏi riêng: `ArtifactRepository` ghi bằng `service_role` (vượt RLS), còn
 * `projectScope` chỉ chứng minh người gọi ĐỌC được dự án. Thiếu bước này, một tài khoản chỉ
 * xem (Kinh doanh, Ban Giám đốc) vẫn đổi được bản "đang hiệu lực" của đầu bài hay phương án —
 * lỗi bắt khi rà soát 08/09/2026. Hỏi đúng hàm mà policy INSERT của `design_artifact` dùng
 * (`rls_design_writable`, migration 0096) để chỉ có MỘT bản quy tắc quyền (CLAUDE.md 3.4).
 *
 * Trả `null` khi được ghi; ngược lại trả câu tiếng Việt kèm mã HTTP để route trả thẳng.
 */
async function denyUnlessWritable(
  db: Awaited<ReturnType<typeof asUser>>,
  tenantId: string,
  projectId: string,
  discipline: 'kien_truc' | 'ket_cau' | 'dien_nuoc' = 'kien_truc',
): Promise<{ error: string; status: 403 | 500 } | null> {
  const allowed = await db.rpc('rls_design_writable', {
    p_tenant_id: tenantId,
    p_project_id: projectId,
    p_discipline: discipline,
  });
  if (allowed.error) return { error: 'Không kiểm tra được quyền sửa hồ sơ.', status: 500 };
  if (allowed.data !== true) return { error: DESIGN_WRITE_DENIED, status: 403 };
  return null;
}

/**
 * Chương trình không gian của đầu bài ĐANG HIỆU LỰC — tính lại mỗi lần gọi.
 *
 * Vì sao tính lại chứ không đọc bản đã đúc: engine tất định, nên tính lại luôn cho ra đúng
 * thứ mà đầu bài hiện tại sinh ra. Đọc bản đã đúc thì sau khi ai đó sửa đầu bài, màn hình
 * vẫn hiện chương trình cũ mà không có dấu hiệu nào — kiến trúc sư xem một đằng, bộ giải
 * chạy một nẻo.
 *
 * `matchesHead` trả lời câu hỏi thật sự quan trọng: bản đang xem có đúng là bản đã chốt cho
 * các lớp sau dùng không.
 *
 * ⚠️ Lượt gọi này đi qua bước quy nhu cầu viết bằng lời. Hiện bước đó bị chặn vì hạng dữ
 * liệu nên không tốn gì; ngày mở khoá mô hình ngôn ngữ, cân nhắc nhớ đệm theo mã đầu bài để
 * mỗi lần mở màn hình không thành một lượt gọi mạng.
 */
designApp.get('/program/:projectId', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) {
    return c.json(
      {
        error:
          'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được xem hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế xem được.',
      },
      404,
    );
  }

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(projectId, 'kien_truc', 'design_brief');
  if (!brief) {
    return c.json(
      { error: 'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.' },
      409,
    );
  }

  const gate = gateLayer2(brief.payload, await readCompletenessThreshold(repo.db, scope.tenantId));
  if (!gate.allowed) return c.json({ error: gate.message }, 409);

  const run = await runLayer2(
    c.env,
    repo.db,
    brief.payload as DesignBrief,
    brief.id,
    scope.tenantId,
  );
  const head = await repo.head(projectId, 'kien_truc', 'space_program');

  return c.json({
    program: run.payload,
    warnings: run.warnings,
    unresolvedNeeds: run.unresolved,
    aiSuggestion: run.aiSuggestion,
    roomLabels: roomLabels(),
    briefArtifactId: brief.id,
    headArtifactId: head?.id ?? null,
    // So bằng MÃ BĂM, không phải so chuỗi JSON: mã băm chính là định nghĩa danh tính của
    // artifact trong hệ thống này (khoá chính của `design_artifact`). So chuỗi là dựng một
    // khái niệm "giống nhau" thứ hai, và nó bất đồng với khái niệm thật ngay khi thứ tự khoá
    // đổi trên đường đi qua kho tệp — đã xảy ra thật: vừa chốt xong đã báo là chưa chốt.
    matchesHead: head ? (await artifactId(run.payload)) === head.id : false,
    // Bản đã chốt do AI lập thì `matchesHead` luôn false (bản tính lại là của bộ giải) — màn
    // hình cần biết điều đó để không nói «đầu bài đã đổi» oan, và để hiện bản AI đang hiệu lực.
    head: head
      ? {
          artifactId: head.id,
          generator: (head.payload as SpaceProgram).generator ?? { kind: 'solver' },
          program: head.payload,
        }
      : null,
  });
});

/**
 * Ngữ cảnh dùng chung của ba tuyến phương án: kho artifact, Container, và hai bảng tra từ
 * `kb/`. Dựng ở MỘT chỗ để ba tuyến không mỗi nơi tra một kiểu.
 */
function variantContext(
  env: DesignEnv,
  projectId: string,
  scope: { companyId: string; tenantId: string; actorId: string | null },
): VariantContext {
  return {
    repo: new ArtifactRepository(env),
    compute: createComputeBackend(env),
    scope: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId,
      discipline: 'kien_truc',
      actorId: scope.actorId,
    },
    siteContext: siteContextTable(),
    viByType: roomLabels(),
    groups: roomGroups(roomVocabulary().vocabulary),
    rulesFor: (locality, buildingType) =>
      ruleCatalogue(
        rulePackFor(locality).rules,
        buildingType,
        roomGroups(roomVocabulary().vocabulary),
      ),
  };
}

const PROJECT_NOT_VISIBLE =
  'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được xem hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế xem được.';

/**
 * Sinh các phương án mặt bằng (Lớp 3a + 3b) cho chương trình không gian đang hiệu lực.
 *
 * ĐỒNG BỘ, không qua Workflow — lý do ở đầu `layout/variants.ts`. Endpoint Workers vì thoả cả
 * (a) gọi Container lẫn (b) ghi artifact + lineage + con trỏ hiệu lực toàn vẹn cùng lúc.
 *
 * Vô nghiệm KHÔNG phải lỗi: một biến thể vô nghiệm vẫn nằm trong danh sách trả về kèm lời
 * giải thích, và tuyến vẫn trả 200.
 */
designApp.post('/floor-plan/generate', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string; timeBudgetS?: number };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const ctx = variantContext(c.env, body.projectId, scope);
  try {
    const outcome = await generateVariants(ctx, {
      timeBudgetS:
        typeof body.timeBudgetS === 'number' && body.timeBudgetS > 0 && body.timeBudgetS <= 60
          ? body.timeBudgetS
          : undefined,
    });
    const listing = await listVariants(ctx);
    return c.json({ ...listing, generated: outcome.results });
  } catch (error) {
    if (error instanceof VariantsPrerequisiteMissing) return c.json({ error: error.message }, 409);
    if (error instanceof ContractError) return c.json({ error: error.message }, 422);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }
});

/** Danh sách phương án đã sinh cho chương trình không gian đang hiệu lực, kèm bản đang chọn. */
designApp.get('/floor-plan/:projectId', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);

  try {
    return c.json(await listVariants(variantContext(c.env, projectId, scope)));
  } catch (error) {
    if (error instanceof VariantsPrerequisiteMissing) return c.json({ error: error.message }, 409);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }
});

/**
 * Chọn một phương án làm bản đang hiệu lực — "kiến trúc sư chọn một phương án AI làm điểm
 * khởi đầu" (08-milestones, điều kiện ra Mốc 5). Mọi bước sau (DXF, khối 3D, thống kê) đọc
 * bản này.
 */
designApp.post('/floor-plan/choose', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string; artifactId?: string };
  if (!body.projectId || !body.artifactId) {
    return c.json({ error: 'Thiếu mã hồ sơ thiết kế hoặc mã phương án.' }, 400);
  }

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const ctx = variantContext(c.env, body.projectId, scope);
  try {
    await chooseVariant(ctx, body.artifactId);
    return c.json(await listVariants(ctx));
  } catch (error) {
    if (error instanceof VariantsPrerequisiteMissing) return c.json({ error: error.message }, 409);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }
});

/**
 * Xuất một tầng của mặt bằng đang hiệu lực ra DXF.
 *
 * Endpoint Workers vì đúng điều kiện (a) của CLAUDE.md 3.1: nó gọi Container tính toán. Phần
 * dựng tệp nằm ở Container, nơi có `ezdxf` — Worker chỉ ghép khung tên và đặt tên tệp.
 *
 * MỘT CHIỀU. Không có endpoint nhập ngược, và sẽ không có: mặt bằng của hệ thống là một cây
 * ràng buộc đã giải, còn tệp DXF chỉ là hình chiếu phẳng của nó. Đọc ngược một tệp ai đó đã
 * kéo tay thì mất sạch siêu dữ liệu ràng buộc và không có cách nào biết ràng buộc nào đã bị
 * phá (CLAUDE.md 8.7).
 */
designApp.get('/floor-plan/:projectId/dxf', async (c) => {
  const prepared = await prepareSheet(c);
  if ('response' in prepared) return prepared.response;
  const { compute, request, filename } = prepared;
  try {
    const dxf = await compute.exportDxf(request);
    return new Response(dxf, {
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="${filename}.dxf"`,
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

/**
 * CÙNG tờ bản vẽ đó, dạng SVG để tab Phương án hiển thị. Container dựng từ một `SheetModel`
 * chung cho cả DXF và SVG — trình duyệt không dựng hình (CLAUDE.md 8.2 #5), chỉ tô màu bằng CSS.
 */
designApp.get('/floor-plan/:projectId/svg', async (c) => {
  const prepared = await prepareSheet(c);
  if ('response' in prepared) return prepared.response;
  const { compute, request } = prepared;
  try {
    const svg = await compute.exportSvg(request);
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

/** Khối ba chiều sơ bộ của mặt bằng đang hiệu lực (hoặc `?artifact=`) — glTF nhị phân, trình duyệt chỉ xem. */
designApp.get('/floor-plan/:projectId/glb', async (c) => {
  const prepared = await prepareSheet(c);
  if ('response' in prepared) return prepared.response;
  const { compute, request } = prepared;
  try {
    // Nhóm mã phòng đi kèm: khối ba chiều cần nhóm `outdoor` để dựng lan can thay vì tường
    // ở cạnh hở của ban công. Container không giữ bảng từ vựng (CLAUDE.md 8.7).
    const glb = await compute.exportGlb({
      floor_plan: request.floor_plan,
      groups: request.groups,
    });
    return new Response(glb, {
      headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

/**
 * Bảng thống kê của mặt bằng đang hiệu lực (hoặc `?artifact=`), tính lại mỗi lần gọi — cùng
 * mặt bằng thì cùng bảng, và mặt bằng đổi là bảng đổi theo (11-design-flow 11.6 Output 4).
 * Không đúc artifact ở bước này: cạnh lineage chỉ nhận các bước đã khai.
 */
designApp.get('/floor-plan/:projectId/schedules', async (c) => {
  const prepared = await prepareSheet(c);
  if ('response' in prepared) return prepared.response;
  const { compute, request, planId } = prepared;
  try {
    const schedules = await compute.schedules({
      floor_plan: request.floor_plan,
      floorplan_ref: planId,
      labels: request.labels,
    });
    // Kèm bảng nhãn theo MÃ PHÒNG: hợp đồng chỉ ghi `room_type`, giao diện cần tên tiếng Việt.
    return c.json({ schedules, roomLabels: roomLabels() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

designApp.get('/floor-plan/:projectId/xlsx', async (c) => {
  const prepared = await prepareSheet(c);
  if ('response' in prepared) return prepared.response;
  const { compute, request, planId, filename } = prepared;
  try {
    // Nhãn theo LOẠI phòng cho sheet diện tích (hợp đồng ghi `room_type`).
    const xlsx = await compute.exportXlsx({
      floor_plan: request.floor_plan,
      floorplan_ref: planId,
      labels: roomLabels(),
      title: `${request.title_block.project_code} — ${request.title_block.project_name}`,
    });
    return new Response(xlsx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename.replace(/_MatBang_T\d+/, '_ThongKe')}.xlsx"`,
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

/**
 * Phối cảnh tham khảo từ ảnh khối (TK-16). Đồng bộ: một lời gọi mô hình sinh ảnh, không có
 * bước nào cần điều phối. Endpoint Workers vì gọi dịch vụ ngoài (a). Tuyến tắt/hết hạn mức
 * → 200 với `status: "unavailable"` và lý do đọc được — AI là phụ trợ, không chặn luồng chính.
 *
 * Ảnh khối là hình học đã giải (hạng 3); route `layer5_render` khai `max_data_class: 3`.
 */
designApp.post('/render', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    image?: string;
    style?: string | null;
    view?: string | null;
  };
  if (!body.projectId || !body.image) {
    return c.json({ error: 'Thiếu mã hồ sơ thiết kế hoặc ảnh khối.' }, 400);
  }
  const image = parseImageDataUrl(body.image);
  if (!image) return c.json({ error: 'Ảnh khối phải là PNG/JPEG dạng data URL.' }, 400);
  // Ảnh chụp canvas hiếm khi quá vài megabyte; chặn để một tệp gửi nhầm không ngốn bộ nhớ.
  if (image.dataBase64.length > 8 * 1024 * 1024) {
    return c.json({ error: 'Ảnh khối quá lớn (trên 6 MB). Thu nhỏ khung xem rồi chụp lại.' }, 400);
  }

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);

  // Ngữ cảnh thửa đất: ảnh khối không nói được rằng hai bên đã có nhà xây sát, nên không có vế
  // này thì mô hình dựng công trình đứng tự do và hay cho nó hai mặt tiền. Đọc từ đầu bài đang
  // hiệu lực, và CHỈ lấy phần hình học + mã danh mục (`RenderSite`) để lời gọi vẫn ở hạng 3.
  //
  // Không có đầu bài, hay đầu bài lập theo hợp đồng cũ, thì bỏ vế ngữ cảnh và vẫn dựng ảnh —
  // ảnh kém ngữ cảnh vẫn hơn không có ảnh, và đây là tính năng phụ trợ (PRD 5.1).
  let siteContext: string | null = null;
  try {
    const brief = await new ArtifactRepository(c.env).head(
      body.projectId,
      'kien_truc',
      'design_brief',
    );
    if (brief) {
      const payload = brief.payload as RenderSite;
      siteContext = describeSite(
        payload,
        siteFaces(payload.site ?? undefined, siteContextTable()).open,
        renderPrompts().context,
      );
    }
  } catch (error) {
    console.error(`[layer5_render] không đọc được đầu bài để dựng ngữ cảnh: ${String(error)}`);
  }

  const outcome = await renderFromMassing({
    router: modelRouter(c.env),
    // Client chọn theo `provider` của tuyến, không gắn cứng một hãng — xem `llm/factory.ts`.
    client: renderImageClient(c.env),
    prompts: renderPrompts(),
    image,
    style: body.style ?? null,
    view: body.view ?? null,
    siteContext,
  });
  return c.json(outcome);
});

/**
 * Danh sách khung hình phối cảnh dựng được — mã, nhãn tiếng Việt, góc chụp ảnh khối.
 *
 * Có endpoint riêng để giao diện KHÔNG phải giữ bản sao thứ hai của danh sách này: nhãn
 * "Toàn cảnh ban ngày" và mã `ngay` nằm ở `kb/render_prompts.yaml`, thêm một khung hình là
 * thêm một mục ở đó. Lời dẫn KHÔNG trả ra — trình duyệt không cần và không nên có.
 */
designApp.get('/render/views', (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  return c.json({
    views: renderPrompts().views.map(({ id, vi, camera }) => ({ id, vi, camera })),
  });
});

/**
 * Phát hành hồ sơ kiến trúc của phương án đang hiệu lực (cảnh 9 của demo, TK-17 → TK-03).
 *
 * Sinh DXF cho từng tầng, cất vào kho artifact (DXF là văn bản nên cùng kho JSON), rồi đi qua
 * `PublishBridge` — điểm giao DUY NHẤT sang hệ tài liệu: tài liệu logic một cái cho mỗi
 * (dự án × bộ môn), số phiên bản do hệ tài liệu cấp, người ký phải có `design.publish.kien_truc`
 * (RLS quyết, không phải Worker). Bản ghi `design_publication` giữ tham chiếu ngược tới
 * artifact mặt bằng và mô hình kiến trúc.
 */
designApp.post('/floor-plan/publish', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string; changeReason?: string | null };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  if (!scope.actorId) return c.json({ error: 'Không xác định được người ký.' }, 401);

  const repo = new ArtifactRepository(c.env);
  const head = await repo.head(body.projectId, 'kien_truc', 'floor_plan');
  if (!head) {
    return c.json(
      { error: 'Chưa có mặt bằng đang hiệu lực. Sinh và chọn một phương án trước khi phát hành.' },
      409,
    );
  }
  const arch = await repo.head(body.projectId, 'kien_truc', 'arch_model');
  const plan = head.payload as { levels: Array<{ level: number }> };

  const project = await db
    .from('design_projects')
    .select('code, name')
    .eq('id', body.projectId)
    .single();
  if (project.error) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const version = head.id.replace(/^sha256:/, '').slice(0, 8);
  const slug = String(project.data.code ?? 'ho-so').replace(/[^A-Za-z0-9-]/g, '');
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const program = await repo.head(body.projectId, 'kien_truc', 'space_program');

  const compute = createComputeBackend(c.env);
  const store = createArtifactStore(c.env);
  const documents: Array<{ kind: 'dxf'; name: string; uri: string; mime_type: string }> = [];
  try {
    for (const level of plan.levels.map((l) => l.level).sort((a, b) => a - b)) {
      const dxf = await compute.exportDxf({
        floor_plan: head.payload,
        level,
        title_block: {
          project_code: String(project.data.code ?? ''),
          project_name: String(project.data.name ?? ''),
          discipline: 'Kiến trúc',
          sheet: 'Mặt bằng công năng',
          version,
          date,
        },
        labels: program ? spaceLabels(program.payload as never, roomLabels()) : {},
        groups: roomGroups(roomVocabulary().vocabulary),
        sheet_code: `kt/${String(level).padStart(2, '0')}`,
      });
      const name = `${slug}_KT_MatBang_T${level}_V${version}.dxf`;
      const uri = await store.put(
        `${body.projectId}/publish/${version}/${name}`,
        new TextDecoder().decode(dxf),
      );
      documents.push({ kind: 'dxf', name, uri, mime_type: 'application/dxf' });
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }

  try {
    const bridge = new PublishBridge(c.env, token);
    const outcome = await bridge.publish({
      schema_version: '1.0.0',
      tenant_id: scope.tenantId,
      project_id: body.projectId,
      artifact_ids: { floor_plan: head.id, ...(arch ? { arch_model: arch.id } : {}) },
      discipline: 'kien_truc',
      documents,
      signed_by: scope.actorId,
      change_reason: body.changeReason ?? `Phát hành mặt bằng phương án ${version}`,
    });
    return c.json({ ...outcome, documents: documents.map((d) => d.name) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, message.includes('người ký') ? 403 : 502);
  }
});

/**
 * Phần chung của hai tuyến xuất tờ: quyền, mặt bằng (bản hiệu lực hoặc một phương án cụ thể
 * qua `?artifact=`), nhãn tiếng Việt từ chương trình không gian, nhóm màu, khung tên, tên tệp.
 */
async function prepareSheet(c: {
  req: {
    header(name: string): string | undefined;
    param(name: string): string;
    query(name: string): string | undefined;
  };
  env: DesignEnv;
  json(body: unknown, status: number): Response;
}): Promise<
  | { response: Response }
  | {
      compute: ReturnType<typeof createComputeBackend>;
      request: ExportDxfRequest;
      filename: string;
      /** Mã băm của mặt bằng đang dùng — làm `floorplan_ref` của bảng thống kê. */
      planId: string;
    }
> {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { response: c.json({ error: 'Chưa đăng nhập.' }, 401) };

  const projectId = c.req.param('projectId');
  const level = Number.parseInt(c.req.query('level') ?? '1', 10);
  if (!Number.isInteger(level) || level < 1 || level > 12) {
    return { response: c.json({ error: 'Số tầng không hợp lệ. Nhập số tầng từ 1 đến 12.' }, 400) };
  }

  const db = await asUser(c.env, token);
  const project = await db
    .from('design_projects')
    .select('id, code, name')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (project.error || !project.data)
    return { response: c.json({ error: PROJECT_NOT_VISIBLE }, 404) };

  const repo = new ArtifactRepository(c.env);
  const wanted = c.req.query('artifact');
  const plan = wanted
    ? await repo.get(wanted, projectId)
    : await repo.head(projectId, 'kien_truc', 'floor_plan');
  if (!plan || (wanted && (plan as { kind?: string }).kind !== 'floor_plan')) {
    return {
      response: c.json(
        {
          error:
            'Chưa có mặt bằng đang hiệu lực. Sinh và chọn một phương án trước khi xuất bản vẽ.',
        },
        409,
      ),
    };
  }

  // Nhãn tiếng Việt theo mã không gian — cùng hàm với bộ giải, nên bản vẽ và bảng so sánh gọi
  // một phòng bằng cùng một tên.
  let labels: Record<string, string> = {};
  const program = await repo.head(projectId, 'kien_truc', 'space_program');
  if (program) labels = spaceLabels(program.payload as never, roomLabels());

  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  // Phiên bản LÀ mã băm nội dung, rút gọn: artifact bất biến, sửa là tạo bản mới, nên tám ký tự
  // đầu truy được về đúng một bản. Đánh số tay sẽ là nguồn sự thật thứ hai.
  const version = plan.id.replace(/^sha256:/, '').slice(0, 8);
  const slug = String(project.data.code ?? 'ho-so').replace(/[^A-Za-z0-9-]/g, '');

  return {
    compute: createComputeBackend(c.env),
    request: {
      floor_plan: plan.payload,
      level,
      title_block: {
        project_code: String(project.data.code ?? ''),
        project_name: String(project.data.name ?? ''),
        discipline: 'Kiến trúc',
        sheet: 'Mặt bằng công năng',
        version,
        date,
      },
      labels,
      groups: roomGroups(roomVocabulary().vocabulary),
      sheet_code: `kt/${String(level).padStart(2, '0')}`,
    },
    filename: `${slug}_KT_MatBang_T${level}_V${version}`,
    planId: plan.id,
  };
}

/**
 * Chốt chương trình không gian — đúc artifact `space_program` và chuyển bản đang hiệu lực.
 *
 * Endpoint Workers vì đúng điều kiện (b) của CLAUDE.md 3.1: artifact + cạnh lineage + con trỏ
 * bản hiệu lực phải toàn vẹn cùng lúc.
 *
 * Tách khỏi việc XEM, cùng lý lẽ với đầu bài: `design_head` phải trỏ tới bản một người thật
 * đã xem và chấp nhận. Đúc theo mỗi lần mở màn hình sẽ nhồi kho artifact bằng những bản chưa
 * ai đọc, và làm "đang hiệu lực" mất nghĩa.
 */
designApp.post('/program/generate', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) {
    return c.json(
      {
        error:
          'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được sửa hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.',
      },
      404,
    );
  }
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, 'kien_truc', 'design_brief');
  if (!brief) {
    return c.json(
      { error: 'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.' },
      409,
    );
  }

  // Cùng cổng chặn với đường ống nền: đầu bài chưa đủ thì Lớp 2 không chạy
  // (03-data-contracts 3.1). Kiểm ở CẢ HAI lối vào, vì bỏ sót một lối là bỏ hẳn cổng chặn.
  const gate = gateLayer2(brief.payload, await readCompletenessThreshold(repo.db, scope.tenantId));
  if (!gate.allowed) return c.json({ error: gate.message }, 409);

  const run = await runLayer2(
    c.env,
    repo.db,
    brief.payload as DesignBrief,
    brief.id,
    scope.tenantId,
  );

  const artifact = await repo.write({
    scope: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId: body.projectId,
      discipline: 'kien_truc',
      actorId: scope.actorId,
    },
    kind: 'space_program',
    payload: run.payload,
    inputs: [brief.id],
    step: 'layer2_program',
    params: run.params,
    setHead: true,
  });

  return c.json({
    artifactId: artifact.id,
    // `reused` nói thẳng "cùng đầu bài, cùng cấu hình nên không có gì đổi" — thông tin thật,
    // và tránh cho người dùng tưởng vừa lập ra một bản khác.
    reused: artifact.reused,
    program: run.payload,
    roomLabels: roomLabels(),
    warnings: run.warnings,
    unresolvedNeeds: run.unresolved,
    aiSuggestion: run.aiSuggestion,
  });
});

/**
 * Lập chương trình không gian BẰNG AI rồi chốt — nhánh song song của `/program/generate` (T10).
 *
 * Cùng cổng chặn, cùng kiểm quyền ghi, cùng dòng lineage (`layer2_program` từ `design_brief`).
 * Khác ở nguồn con số: mô hình đề xuất, Worker kiểm và điền phần tất định (`ai/program.ts`).
 * Đầu vào của mô hình là đầu bài + khảo sát ĐÃ LƯỢC DANH TÍNH (hạng 2, T12).
 */
designApp.post('/program/ai-generate', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string; route?: string };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  // Tuyến phải nằm trong danh mục VĂN BẢN và đang bấm được — trình duyệt không chọn được gì
  // ngoài những tên `config/models.yaml` khai (hàng rào 2 của nhánh AI).
  const router = modelRouter(c.env);
  const catalogue = aiModelCatalogue(router);
  if (!isSelectableRoute(catalogue, 'text', body.route)) {
    return c.json(
      {
        error:
          'Model đã chọn không dùng được lúc này. Chọn model khác trong ô «Model», hoặc dùng bộ giải nội bộ.',
      },
      409,
    );
  }
  const client = textClientFor(c.env, body.route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, 'kien_truc', 'design_brief');
  if (!brief) {
    return c.json(
      { error: 'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.' },
      409,
    );
  }
  const gate = gateLayer2(brief.payload, await readCompletenessThreshold(repo.db, scope.tenantId));
  if (!gate.allowed) return c.json({ error: gate.message }, 409);

  const briefPayload = brief.payload as DesignBrief;
  // Chữ tự do và khảo sát đọc dưới PHIÊN NGƯỜI DÙNG (RLS) — không dùng service_role để gom
  // dữ liệu mà người gọi không được xem.
  const digest = anonymiseForAi(await aiDigestInputs(db, body.projectId, briefPayload));

  const baseline = await runLayer2(c.env, repo.db, briefPayload, brief.id, scope.tenantId);
  const rules = rulePackFor(briefPayload.locality);
  const norms = spaceNorms();
  const labels = roomLabels();
  const publicRoute = router.publicRoutes().find((r) => r.route === body.route);
  const callScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId: body.projectId,
    discipline: 'kien_truc' as const,
    actorId: scope.actorId,
  };

  let result: Awaited<ReturnType<typeof generateAiProgram>>;
  try {
    result = await generateAiProgram({
      brief: briefPayload,
      briefRef: brief.id,
      digest,
      route: body.route,
      client,
      prompts: aiPrompts(),
      rules,
      norms,
      vocabulary: roomVocabulary(),
      labels,
      plausibility: plausibilityRules(),
    });
  } catch (error) {
    if (error instanceof AiProgramRejected) {
      await recordAiCall(
        repo.db,
        callScope,
        {
          route: body.route,
          purpose: 'program',
          dataClass: AI_DIGEST_DATA_CLASS,
          promptVersion: aiPrompts().version,
        },
        {
          provider: publicRoute?.provider ?? '',
          model: publicRoute?.model ?? '',
          usage: { inputTokens: null, outputTokens: null },
          latencyMs: 0,
          status: 'rejected',
          errorCode: 'AiProgramRejected',
        },
        publicRoute?.pricing,
      );
      return c.json({ error: error.message, findings: error.findings }, 422);
    }
    throw error;
  }

  const artifact = await repo.write({
    scope: callScope,
    kind: 'space_program',
    payload: result.payload,
    inputs: [brief.id],
    step: 'layer2_program',
    params: {
      generator: result.payload.generator,
      route: body.route,
      prompt_version: aiPrompts().version,
    },
    setHead: true,
  });
  for (const call of result.calls) {
    await recordAiCall(
      repo.db,
      callScope,
      {
        route: body.route,
        purpose: 'program',
        dataClass: AI_DIGEST_DATA_CLASS,
        promptVersion: aiPrompts().version,
      },
      { ...call, status: 'ok', artifactId: artifact.id },
      publicRoute?.pricing,
    );
  }

  return c.json({
    artifactId: artifact.id,
    reused: artifact.reused,
    program: result.payload,
    roomLabels: labels,
    warnings: result.warnings,
    unresolvedNeeds: [],
    aiSuggestion: null,
    generator: result.payload.generator,
    rationale: result.rationale,
    assumptions: result.assumptions,
    notes: result.notes,
    comparison: compareProgramsById(baseline.payload, result.payload),
    repaired: result.repaired,
  });
});

/** Gom chữ tự do, khảo sát và danh tính cần lược — đọc qua RLS của chính người gọi. */
async function aiDigestInputs(
  db: Awaited<ReturnType<typeof asUser>>,
  projectId: string,
  brief: DesignBrief,
): Promise<AnonymiseInput> {
  const row = await db
    .from('design_briefs')
    .select(
      'design_task, functional_needs, style_note, site_condition, legal_documents, site_source_survey_id',
    )
    .eq('design_project_id', projectId)
    .eq('is_current_version', true)
    .is('deleted_at', null)
    .maybeSingle();
  const freeText = (row.data ?? null) as AnonymiseInput['freeText'] & {
    site_source_survey_id?: string | null;
  };
  let survey: AnonymiseInput['survey'] = null;
  if (freeText?.site_source_survey_id) {
    const s = await db
      .from('design_surveys')
      .select(
        'land_width, land_depth, land_area, orientation, measurement_notes, surrounding_notes, usage_notes, notes',
      )
      .eq('id', freeText.site_source_survey_id)
      .maybeSingle();
    survey = (s.data ?? null) as AnonymiseInput['survey'];
  }
  const project = await db
    .from('design_projects')
    .select('customer:customers(name, phone, address)')
    .eq('id', projectId)
    .maybeSingle();
  const customer = (
    project.data as { customer?: { name?: string; phone?: string; address?: string } | null } | null
  )?.customer;
  return {
    brief,
    freeText,
    survey,
    identities: [customer?.name, customer?.phone, customer?.address],
  };
}

/**
 * Trần kích thước ảnh tải lên để đọc ranh giới thửa đất.
 *
 * Nhỏ hơn hẳn `MAX_SOURCE_BYTES` (50 MB, trần LƯU TRỮ của `source-files.ts`): đây là trần
 * PAYLOAD gửi thẳng vào lời gọi Gemini — request quá khổ dễ hết giờ ở tầng mạng trước khi
 * kịp trả lỗi đọc được. Ảnh chụp bằng điện thoại nén JPEG hiếm khi vượt vài megabyte.
 */
const MAX_SITE_IMAGE_BYTES = 15 * 1024 * 1024;

const SITE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Đọc ảnh trích lục/sổ đỏ, trả về ranh giới thửa đất để điền nháp vào bảng đỉnh của biểu mẫu
 * Đầu bài — người dùng vẫn xem lại/sửa từng đỉnh trước khi lưu.
 *
 * Đồng bộ, không qua Workflow: chỉ một lượt gọi Gemini rồi một phép tính thuần
 * (`polygonFromEdges`), không có bước nào cần điều phối nhiều lần thử lại.
 *
 * Endpoint Workers vì đúng điều kiện (a) của CLAUDE.md 3.1: gọi dịch vụ bên ngoài (Gemini).
 * KHÔNG đúc artifact — xem doc-comment của `extractSiteBoundary`.
 */
designApp.post('/site/extract-boundary', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const llm = geminiClient(c.env);
  if (!llm) {
    return c.json(
      {
        error: 'Chưa cấu hình mô hình đọc ảnh. Báo Quản trị hệ thống bổ sung khoá Gemini.',
        retryable: false,
      },
      503,
    );
  }

  const form = await c.req.formData();
  const projectId = form.get('projectId');
  const file = form.get('file');
  if (typeof projectId !== 'string' || !projectId) {
    return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  }
  if (!(file instanceof File)) {
    return c.json({ error: 'Chưa chọn ảnh trích lục/sổ đỏ để đọc.' }, 400);
  }
  if (!SITE_IMAGE_MIME_TYPES.has(file.type)) {
    return c.json({ error: 'Chỉ nhận ảnh định dạng JPEG, PNG, WEBP hoặc HEIC/HEIF.' }, 400);
  }
  if (file.size > MAX_SITE_IMAGE_BYTES) {
    return c.json(
      {
        error: `Ảnh nặng ${Math.round(file.size / 1024 / 1024)} MB, vượt hạn ${MAX_SITE_IMAGE_BYTES / 1024 / 1024} MB. Chụp lại ở độ phân giải thấp hơn hoặc cắt bớt phần thừa quanh thửa đất.`,
      },
      400,
    );
  }

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) {
    return c.json(
      {
        error:
          'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được sửa hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.',
      },
      404,
    );
  }

  // Hỏi thẳng CSDL, không chép lại điều kiện quyền ở tầng Worker (CLAUDE.md 3.4) — đây là
  // hàm đã cấp quyền RPC sẵn cho việc này (cùng mẫu với `rls_kb_writable` ở `/kb/digitise`).
  const allowed = await db.rpc('rls_design_writable', {
    p_tenant_id: scope.tenantId,
    p_project_id: projectId,
    p_discipline: 'kien_truc',
  });
  if (allowed.error) return c.json({ error: 'Không kiểm tra được quyền sửa hồ sơ.' }, 500);
  if (allowed.data !== true) return c.json({ error: DESIGN_WRITE_DENIED }, 403);

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Giữ ảnh gốc để truy ngược khi kết quả đọc trông sai — cùng kho với bản vẽ CAD nguồn
  // (`source-files.ts`: "tệp nhị phân do người tải lên, giữ để truy ngược, không gắn
  // artifact" khớp đúng bản chất của ảnh này).
  const store = createSourceFileStore(c.env);
  const saved: StoredSource = await store.put(file.name || 'trich-luc.jpg', bytes);

  const result = await extractSiteBoundary(llm, { mimeType: file.type, bytes });

  return c.json({
    boundaryM: result.boundaryM,
    edges: result.edges,
    assumedAngleIndices: result.assumedAngleIndices,
    closureErrorM: result.closureErrorM,
    closureErrorDeg: result.closureErrorDeg,
    closedShapeConfidence: result.closedShapeConfidence,
    warnings: result.warnings,
    sourceUri: saved.uri,
  });
});

/**
 * Truy hồi hồ sơ tham chiếu — tầng 1+2 ở CSDL, chọn đa dạng ở đây (06-knowledge-base 6.3).
 *
 * Không kiểm quyền ở tầng này: `kb_retrieve_candidates` là SECURITY INVOKER nên RLS đã quyết
 * định thấy được bản ghi nào. Kiểm thêm ở đây là tạo bản quy tắc thứ hai sẽ lệch (CLAUDE.md 3.4).
 */
designApp.post('/kb/retrieve', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = await c.req.json();
  const db = await asUser(c.env, token);

  const result = await retrieveFewShots(db, {
    tenantId: body.tenantId,
    buildingType: body.buildingType,
    floors: body.floors,
    widthM: body.widthM,
    depthM: body.depthM,
    familyArchetype: body.familyArchetype,
    style: body.style,
    minQuality: body.minQuality,
    requireSlicingTree: body.requireSlicingTree,
    excludeProjectCode: body.excludeProjectCode,
    wantedAdjacency: body.wantedAdjacency,
    k: body.k,
    lambda: body.lambda,
  });

  return c.json(result);
});

/**
 * Bước 3 số hoá — kiến trúc sư ghi tri thức ngầm, hệ thống tính lại vector nhúng.
 *
 * Chú giải và vector ghi trong CÙNG một câu lệnh SQL (`kb_apply_rationale`): tách ra thì có
 * ngày lời gọi thứ hai hỏng và bản ghi mang chú giải mới với vector cũ — một sai lệch không
 * có triệu chứng nào ngoài việc truy hồi trả kết quả kỳ lạ.
 */
designApp.post('/kb/annotate', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    id?: string;
    rationale?: RationalePayload;
    outcome?: { client_satisfied?: boolean | null; construction_issues?: string[] } | null;
  };
  if (!body.id) return c.json({ error: 'Thiếu mã bản ghi cần chú giải.' }, 400);

  const db = await asUser(c.env, token);

  // Đọc lại bản ghi qua RLS trước khi nhúng: người không được xem bản ghi thì cũng không được
  // biến nội dung của nó thành một lời gọi ra dịch vụ ngoài.
  const current = await db
    .from('kb_record')
    .select('payload')
    .eq('id', body.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (current.error) return c.json({ error: 'Không đọc được bản ghi cần chú giải.' }, 500);
  if (!current.data) {
    return c.json(
      {
        error:
          'Không tìm thấy bản ghi, hoặc tài khoản không được xem hồ sơ bộ môn này. Người có quyền ghi hồ sơ kiến trúc của Phòng Thiết kế thực hiện được việc này.',
      },
      404,
    );
  }

  const record = { ...(current.data.payload as object), rationale: body.rationale ?? null };
  const text = embeddingText(record);
  const withheld = withheldFields(body.rationale);

  let embedding: number[] | null = null;
  const llm = geminiClient(c.env);
  if (llm && text) {
    try {
      // Hạng 3: văn bản nhúng chỉ gồm lựa chọn rời rạc và thuộc tính không định danh — xem
      // danh sách CHO PHÉP ở `kb/rationale.ts`. Ô chữ tự do không nằm trong đó.
      embedding = await llm.embed('kb_rationale_embed', 3, text);
    } catch (error) {
      // Nhúng hỏng KHÔNG được làm mất phần chú giải người vừa nhập (AFD 6.3). Ghi chú giải,
      // để vector rỗng, và nói rõ ra — chú giải lại là tính lại vector.
      console.error('design: nhúng chú giải hỏng', error);
    }
  }

  const saved = await db.rpc('kb_apply_rationale', {
    p_id: body.id,
    p_rationale: body.rationale ?? null,
    p_embedding: embedding ? `[${embedding.join(',')}]` : null,
    p_outcome: body.outcome ?? null,
  });
  if (saved.error) {
    console.error('kb/annotate: không ghi được chú giải', saved.error);
    return c.json(
      {
        error:
          'Không ghi được chú giải. Chỉ người có quyền ghi kiến trúc mới chú giải được hồ sơ này.',
      },
      403,
    );
  }

  return c.json({ id: saved.data, embedded: embedding !== null, withheld });
});

/**
 * Lỗi hiển thị cho người dùng: nêu VIỆC GÌ không làm được và CẦN LÀM GÌ, không mã HTTP,
 * không vết ngăn xếp (CGD 5.5). Chi tiết kỹ thuật chỉ ghi log.
 */
designApp.onError((error, c) => {
  console.error('design:', error);

  if (error instanceof ContractError) {
    return c.json({ error: error.message, retryable: false }, 422);
  }
  if (error instanceof DataClassViolation) {
    return c.json({ error: error.message, retryable: false }, 403);
  }
  if (error instanceof ModelNotConfigured) {
    return c.json({ error: error.message, retryable: false }, 503);
  }
  if (error instanceof LlmCallFailed) {
    // `error.message` chứa nguyên văn mã HTTP + JSON lỗi của nhà cung cấp (đã ghi log ở trên) —
    // đúng thứ CGD 5.5 cấm hiện cho người dùng. Chỉ hai nhóm nguyên nhân thật sự khác nhau với
    // người dùng: quá tải/tạm thời (thử lại được) và mọi trường hợp còn lại.
    // Client biết việc gì hỏng (từ chối, hết token, không ra ảnh…) thì tự nói bằng tiếng Việt
    // qua `userMessage`; ở đây chỉ còn câu chung cho lỗi mạng/HTTP mà chi tiết là của nhà cung cấp.
    const selfDiagnosed = error.status === undefined && !error.retryable;
    const message =
      error.userMessage ??
      (selfDiagnosed
        ? error.message
        : error.retryable
          ? 'Mô hình đang quá tải, thử lại sau ít phút.'
          : 'Mô hình không xử lý được yêu cầu này. Thử lại sau, hoặc báo Quản trị hệ thống nếu vẫn lỗi.');
    return c.json({ error: message, retryable: error.retryable }, error.retryable ? 503 : 502);
  }
  if ((error as { retryable?: boolean }).retryable) {
    return c.json({ error: error.message, retryable: true }, 503);
  }
  return c.json({ error: error.message }, 400);
});

export { DesignPipeline } from './workflows/design-pipeline';
export { DigitisePipeline } from './workflows/digitise';
