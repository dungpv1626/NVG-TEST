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
} from '@nvg/shared/design';
import { ContractError } from './contracts';
import { createComputeBackend } from './compute-backend';
import { DataClassViolation, ModelNotConfigured } from './llm/router';
import { geminiClient, modelRouter } from './llm/factory';
import { LlmCallFailed } from './llm/gemini';
import { PublishBridge } from './publish';
import { ArtifactRepository } from './artifacts';
import { buildBriefPayload } from './brief/payload';
import { gateLayer2, readCompletenessThreshold } from './brief/gate';
import { runLayer2 } from './program/run';
import { retrieveFewShots } from './kb/retrieve';
import { roomVocabulary } from './kb/vocabulary-data';
import { embeddingText, withheldFields, type RationalePayload } from './kb/rationale';
import { createSourceFileStore, type StoredSource } from './source-files';
import type { DigitiseParams, DigitiseSource } from './workflows/digitise-steps';
import { extractSiteBoundary } from './site/extract-boundary';
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
    compute: { backend: compute.name, reachable: await compute.health() },
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
  if (saved.error) return c.json({ error: saved.error.message }, 403);

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
    roomLabels: roomLabels(),
    briefArtifactId: brief.id,
    headArtifactId: head?.id ?? null,
    // So bằng MÃ BĂM, không phải so chuỗi JSON: mã băm chính là định nghĩa danh tính của
    // artifact trong hệ thống này (khoá chính của `design_artifact`). So chuỗi là dựng một
    // khái niệm "giống nhau" thứ hai, và nó bất đồng với khái niệm thật ngay khi thứ tự khoá
    // đổi trên đường đi qua kho tệp — đã xảy ra thật: vừa chốt xong đã báo là chưa chốt.
    matchesHead: head ? (await artifactId(run.payload)) === head.id : false,
  });
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
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const level = Number.parseInt(c.req.query('level') ?? '1', 10);
  if (!Number.isInteger(level) || level < 1 || level > 12) {
    return c.json({ error: 'Số tầng không hợp lệ. Nhập số tầng từ 1 đến 12.' }, 400);
  }

  const db = await asUser(c.env, token);
  const project = await db
    .from('design_projects')
    .select('id, code, name')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (project.error || !project.data) {
    return c.json(
      {
        error:
          'Không tìm thấy hồ sơ thiết kế, hoặc tài khoản không được xem hồ sơ này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế xem được.',
      },
      404,
    );
  }

  const repo = new ArtifactRepository(c.env);
  const head = await repo.head(projectId, 'kien_truc', 'floor_plan');
  if (!head) {
    return c.json(
      { error: 'Chưa có mặt bằng đang hiệu lực. Chạy bước giải ràng buộc trước khi xuất bản vẽ.' },
      409,
    );
  }

  const compute = createComputeBackend(c.env);
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  // Phiên bản LÀ mã băm nội dung, rút gọn. Trong hệ thống này không có số phiên bản nào khác:
  // artifact bất biến, sửa là tạo bản mới, nên tám ký tự đầu của mã băm truy được về đúng một
  // bản duy nhất. Đánh số tay sẽ là nguồn sự thật thứ hai và sớm muộn nói khác đi.
  const version = head.id.replace(/^sha256:/, '').slice(0, 8);

  let dxf: ArrayBuffer;
  try {
    dxf = await compute.exportDxf({
      floor_plan: head.payload,
      level,
      title_block: {
        project_code: String(project.data.code ?? ''),
        project_name: String(project.data.name ?? ''),
        discipline: 'Kiến trúc',
        sheet: 'Mặt bằng',
        version,
        date,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }

  // ⚠️ Quy ước đặt tên tệp của NVG ngoài đời khác mã hồ sơ trong hệ thống (câu hỏi Q-7 chờ
  // Haan). Tạm ghép từ mã hệ thống để tệp luôn truy được về đúng hồ sơ; đổi quy ước là sửa
  // đúng dòng này.
  const slug = String(project.data.code ?? 'ho-so').replace(/[^A-Za-z0-9-]/g, '');
  const filename = `${slug}_KT_MatBang_T${level}_V${version}.dxf`;

  return new Response(dxf, {
    headers: {
      'Content-Type': 'application/dxf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

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
  });
});

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
  if (allowed.data !== true) {
    return c.json(
      {
        error:
          'Không đủ quyền sửa hồ sơ kiến trúc của dự án này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được việc này.',
      },
      403,
    );
  }

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
  if (saved.error) return c.json({ error: saved.error.message }, 403);

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
    const message = error.retryable
      ? 'Mô hình ngôn ngữ đang quá tải, thử lại sau ít phút.'
      : 'Không đọc được ảnh bằng mô hình ngôn ngữ. Thử lại sau, hoặc báo Quản trị hệ thống nếu vẫn lỗi.';
    return c.json({ error: message, retryable: error.retryable }, error.retryable ? 503 : 502);
  }
  if ((error as { retryable?: boolean }).retryable) {
    return c.json({ error: error.message, retryable: true }, 503);
  }
  return c.json({ error: error.message }, 400);
});

export { DesignPipeline } from './workflows/design-pipeline';
export { DigitisePipeline } from './workflows/digitise';
