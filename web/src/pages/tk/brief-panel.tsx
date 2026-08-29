/**
 * Tab Đầu bài của Chi tiết Dự án thiết kế — TK-01 và Lớp 1 của engine thiết kế (TK-10).
 *
 * **Một biểu mẫu duy nhất.** Điều kiện ra của Mốc 2 ghi rõ "không còn nhập hai nơi"
 * (`doc/design/08-milestones.md`), nên phần có cấu trúc mà engine cần và phần chữ tự do mà
 * Kinh doanh với Dự toán đọc nằm chung một chỗ, lưu chung một lần.
 *
 * **Nội dung biểu mẫu KHÔNG nằm trong tệp này.** Trường nào, thứ tự nào, hiện với loại hình
 * nào, nặng bao nhiêu điểm — tất cả ở `shared/src/design/brief-form.json`. Ở đây chỉ có
 * cách vẽ và cách lưu. Thêm câu hỏi cho biệt thự là sửa tệp JSON đó.
 *
 * **Hai chế độ lưu, khác nhau ở chỗ đã xác nhận hay chưa:**
 *  - Chưa xác nhận → "Lưu nháp" sửa tại chỗ, không đẻ phiên bản.
 *  - Đã xác nhận → "Điều chỉnh đầu bài" lập phiên bản mới, bắt buộc nêu nguyên nhân (NEN-05).
 *
 * Vì sao không phải mỗi lần lưu là một phiên bản như bản cũ: biểu mẫu này dài gấp ba lần,
 * và mỗi phiên bản từ bản thứ hai đều đòi lý do. Dấu vết kiểm toán tồn tại để trả lời "khách
 * đổi yêu cầu lúc nào" — chưa xác nhận thì chưa ai dựa vào bản đó.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, Ruler } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@nvg/shared';
import {
  ACCESS_SIDES,
  BRIEF_FORM,
  checkBriefConsistency,
  FAMILY_ROLE_LABEL,
  FLOOR_PREF_LABEL,
  isFieldVisible,
  scoreBrief,
  setAtPath,
  SIDE_LABEL,
  valueAtPath,
  visibleFields,
  type BriefFormField,
  type DesignBriefDraft,
  type FamilyRole,
  type FloorPref,
} from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import {
  useConfirmBriefArtifact,
  useDesignBriefs,
  useDesignSetting,
  useSaveBriefDraft,
  useSaveDesignBrief,
  type DesignBriefRecord,
} from '@/hooks/use-design-projects';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { BriefField } from './brief-field';

const EM_DASH = '—';

/** Sáu ô chữ tự do của TK-01 — cột riêng trong bảng, không nằm trong hợp đồng dữ liệu. */
type LegacyText = Record<string, string | null>;

const LEGACY_COLUMNS: Record<string, string> = {
  'legacy.design_task': 'design_task',
  'legacy.functional_needs': 'functional_needs',
  'legacy.style_note': 'style_note',
  'legacy.site_condition': 'site_condition',
  'legacy.legal_documents': 'legal_documents',
};

function toLegacy(brief: DesignBriefRecord | undefined): LegacyText {
  return {
    design_task: brief?.design_task ?? null,
    functional_needs: brief?.functional_needs ?? null,
    style_note: brief?.style_note ?? null,
    site_condition: brief?.site_condition ?? null,
    legal_documents: brief?.legal_documents ?? null,
  };
}

export function BriefPanel({
  projectId,
  companyId,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: briefs, isLoading } = useDesignBriefs(projectId);
  const { data: surveys } = useDesignSurveys(projectId);
  const { data: thresholdRaw } = useDesignSetting('brief_completeness_min');

  const saveNewVersion = useSaveDesignBrief();
  const saveDraft = useSaveBriefDraft();
  const confirmArtifact = useConfirmBriefArtifact();

  const current = briefs?.find((b) => b.is_current_version);
  const history = (briefs ?? []).filter((b) => !b.is_current_version);
  const survey = surveys?.[0];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DesignBriefDraft>({});
  const [legacy, setLegacy] = useState<LegacyText>(toLegacy(undefined));
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Chỉ nạp lại khi ĐỔI bản ghi, không phải mỗi lần vẽ lại: nạp lại giữa chừng là xoá những
  // gì người dùng vừa gõ (Webapp Flow 6.3).
  useEffect(() => {
    if (editing) return;
    setDraft((current?.structured as DesignBriefDraft) ?? {});
    setLegacy(toLegacy(current));
    setSurveyId(current?.site_source_survey_id ?? null);
  }, [current, editing]);

  useUnsavedChangesGuard(editing);

  const score = useMemo(() => scoreBrief(draft, BRIEF_FORM), [draft]);
  const issues = useMemo(() => checkBriefConsistency(draft, BRIEF_FORM), [draft]);
  const shown = useMemo(() => visibleFields(BRIEF_FORM, draft), [draft]);
  const threshold = typeof thresholdRaw === 'number' ? thresholdRaw : null;

  /** Bản đã xác nhận là bất biến — sửa nó nghĩa là lập phiên bản mới. */
  const needsNewVersion = Boolean(current?.confirmed_at);

  function startEditing() {
    setDraft((current?.structured as DesignBriefDraft) ?? {});
    setLegacy(toLegacy(current));
    setSurveyId(current?.site_source_survey_id ?? null);
    setChangeReason('');
    setError(null);
    setEditing(true);
  }

  function setField(path: string, value: unknown) {
    if (path.startsWith('legacy.')) {
      const column = LEGACY_COLUMNS[path]!;
      setLegacy((prev) => ({ ...prev, [column]: (value as string | undefined) ?? null }));
      return;
    }
    setDraft((prev) => setAtPath(prev, path, value));
  }

  /** Chép kích thước lô từ biên bản khảo sát — không gõ lại con số đã có (PRD 2.3). */
  function copyFromSurvey() {
    if (!survey) return;
    let next = draft;
    if (survey.land_width) next = setAtPath(next, 'site.width_m', Number(survey.land_width));
    if (survey.land_depth) next = setAtPath(next, 'site.depth_m', Number(survey.land_depth));
    setDraft(next);
    setSurveyId(survey.id);
  }

  async function save() {
    setError(null);

    // Điểm ghi vào payload để cột sinh trong CSDL có giá trị hiển thị ngay. Con số quyết
    // định Lớp 2 thì Worker tự tính lại khi xác nhận — cái này chỉ để lọc và hiện.
    const payload: DesignBriefDraft = {
      ...draft,
      completeness_score: score.score,
      missing_fields: score.missingFields,
    };

    try {
      if (needsNewVersion || !current) {
        if (current && !changeReason.trim()) {
          setError('Vui lòng nêu nguyên nhân điều chỉnh đầu bài so với bản đang hiệu lực.');
          return;
        }
        await saveNewVersion.mutateAsync({
          projectId,
          companyId,
          designTask: legacy.design_task ?? null,
          functionalNeeds: legacy.functional_needs ?? null,
          budgetAmount: null,
          budgetNote: null,
          styleNote: legacy.style_note ?? null,
          siteCondition: legacy.site_condition ?? null,
          legalDocuments: legacy.legal_documents ?? null,
          changeReason: changeReason.trim() || null,
          structured: payload,
          siteSourceSurveyId: surveyId,
        });
      } else {
        await saveDraft.mutateAsync({
          briefId: current.id,
          structured: payload,
          legacy,
          siteSourceSurveyId: surveyId,
        });
      }
      setEditing(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function confirm() {
    if (!current) return;
    setError(null);
    try {
      await confirmArtifact.mutateAsync({ briefId: current.id });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  if (isLoading) return null;

  // ---------------------------------------------------------------------------
  // Chế độ nhập
  // ---------------------------------------------------------------------------
  if (editing) {
    const issuesFor = (path: string) =>
      issues.filter((i) => i.paths.includes(path)).map((i) => i.message);

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {BRIEF_FORM.sections.map((section) => {
            const fields = shown.filter((v) => v.section.id === section.id);
            if (fields.length === 0) return null;
            return (
              <section
                key={section.id}
                id={`brief-section-${section.id}`}
                className="rounded-lg border border-border bg-surface p-4 shadow-card"
              >
                <h3 className="font-semibold">{section.title}</h3>
                {section.hint && <p className="mt-0.5 text-fg-subtle">{section.hint}</p>}
                <div className="mt-3 space-y-4">
                  {fields.map(({ field }) => (
                    <BriefField
                      key={field.path}
                      field={field}
                      value={
                        field.path.startsWith('legacy.')
                          ? (legacy[LEGACY_COLUMNS[field.path]!] ?? undefined)
                          : valueAtPath(draft, field.path)
                      }
                      onChange={(value) => setField(field.path, value)}
                      issues={issuesFor(field.path)}
                    />
                  ))}
                </div>

                {section.id === 'khu_dat' && survey && (
                  <Button variant="secondary" className="mt-3" onClick={copyFromSurvey}>
                    <Ruler className="size-4" />
                    Lấy theo biên bản khảo sát{' '}
                    {formatDateTime(survey.surveyed_at ?? survey.created_at)}
                  </Button>
                )}
              </section>
            );
          })}

          {needsNewVersion && (
            <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <h3 className="font-semibold">Nguyên nhân điều chỉnh</h3>
              <p className="mt-0.5 text-fg-subtle">
                Bản đang hiệu lực đã được xác nhận, nên lần lưu này lập phiên bản mới.
              </p>
              <textarea
                rows={2}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Ví dụ: khách bổ sung phòng thờ ở tầng trên cùng"
                className="mt-2 w-full rounded border border-border bg-surface p-2"
              />
            </section>
          )}

          {error && <p className="text-status-overdue">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void save()}>
              {needsNewVersion || !current ? 'Lưu đầu bài' : 'Lưu nháp'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Hủy
            </Button>
          </div>
        </div>

        <CompletenessPanel score={score} issues={issues} threshold={threshold} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Chưa có đầu bài
  // ---------------------------------------------------------------------------
  if (!current) {
    return (
      <EmptyState
        message="Chưa có đầu bài. Ghi nhận khu đất, quy mô, nhu cầu của gia đình và ngân sách trước khi dựng phương án."
        action={
          readOnly ? undefined : (
            <Button variant="primary" onClick={startEditing}>
              Lập đầu bài
            </Button>
          )
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Chế độ xem
  // ---------------------------------------------------------------------------
  const savedScore =
    current.completeness_score !== null ? Number(current.completeness_score) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="font-medium">Đầu bài đang hiệu lực — phiên bản {current.version}</p>
            {current.confirmed_at ? (
              <span className="inline-flex items-center gap-1 text-status-completed">
                <CheckCircle2 className="size-4" />
                Đã xác nhận {formatDateTime(current.confirmed_at)}
              </span>
            ) : (
              <span className="text-status-pending">Chưa xác nhận</span>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              {!readOnly && !current.confirmed_at && (
                <Button variant="secondary" onClick={() => void confirm()}>
                  Xác nhận đầu bài
                </Button>
              )}
              {!readOnly && (
                <Button variant="secondary" onClick={startEditing}>
                  {current.confirmed_at ? 'Điều chỉnh đầu bài' : 'Sửa đầu bài'}
                </Button>
              )}
            </span>
          </div>

          <SurveyMismatch brief={current} survey={survey} />

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {/*
              Lọc bằng ĐÚNG hàm mà biểu mẫu dùng: câu hỏi chỉ dành cho biệt thự không được
              hiện ở chế độ xem của một hồ sơ nhà phố, dù chỉ hiện dấu gạch ngang. Một danh
              sách trường trống kéo dài làm người đọc tưởng hồ sơ còn thiếu.
            */}
            {BRIEF_FORM.sections.flatMap((section) =>
              section.fields
                .filter(
                  (field) =>
                    !field.path.startsWith('legacy.') &&
                    isFieldVisible(field, section, current.structured ?? {}),
                )
                .map((field) => (
                  <ReadOnlyField
                    key={field.path}
                    label={field.label}
                    value={describeField(field, valueAtPath(current.structured, field.path))}
                  />
                )),
            )}
            <ReadOnlyField label="Nhiệm vụ thiết kế" value={current.design_task} wide />
            <ReadOnlyField
              label="Ghi chú thêm về công năng"
              value={current.functional_needs}
              wide
            />
            <ReadOnlyField label="Ghi chú thêm về phong cách" value={current.style_note} wide />
            <ReadOnlyField label="Ghi chú thêm về hiện trạng" value={current.site_condition} wide />
            <ReadOnlyField label="Hồ sơ pháp lý hiện có" value={current.legal_documents} wide />
          </dl>
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <p className="mb-3 flex items-center gap-2 font-medium">
              <History className="size-4 text-fg-subtle" />
              Các phiên bản trước ({history.length})
            </p>
            <ul className="space-y-3">
              {history.map((brief) => (
                <li key={brief.id} className="border-l-2 border-border pl-3">
                  <p className="font-medium">
                    Phiên bản {brief.version}
                    <span className="ml-2 font-normal text-fg-subtle">
                      {formatDateTime(brief.created_at)}
                      {brief.author ? ` — ${brief.author.full_name}` : ''}
                    </span>
                  </p>
                  <p className="text-fg-subtle">{brief.change_reason ?? 'Bản đầu tiên'}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CompletenessPanel
        score={{ ...score, score: savedScore ?? score.score }}
        issues={issues}
        threshold={threshold}
        artifactId={current.artifact_id}
      />
    </div>
  );
}

/**
 * Thước độ đầy đủ + danh sách còn thiếu + danh sách mâu thuẫn.
 *
 * Trạng thái hiện bằng CHỮ kèm màu, không bằng màu một mình (CGD 6.8). Dùng đúng năm màu
 * trạng thái chuẩn: chưa đủ là "Chờ duyệt" (vàng) chứ KHÔNG phải "Quá hạn" (đỏ) — thiếu
 * thông tin không phải là trễ hạn.
 */
function CompletenessPanel({
  score,
  issues,
  threshold,
  artifactId,
}: {
  score: ReturnType<typeof scoreBrief>;
  issues: ReturnType<typeof checkBriefConsistency>;
  threshold: number | null;
  artifactId?: string | null;
}) {
  const percent = Math.round(score.score * 100);
  const enough = threshold !== null && score.score >= threshold;
  const tone = score.score === 0 ? 'draft' : enough ? 'completed' : 'pending';

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <p className="font-medium">Mức độ đầy đủ</p>
        <p className={`mt-1 text-2xl font-semibold text-status-${tone}`}>{percent}%</p>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mức độ đầy đủ của đầu bài"
        >
          <div className={`h-full bg-status-${tone}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-fg-subtle">
          {threshold === null
            ? 'Chưa cấu hình mức đầy đủ tối thiểu.'
            : enough
              ? 'Đã đủ thông tin để dựng phương án tự động.'
              : `Chưa đủ để dựng phương án tự động — cần từ ${Math.round(threshold * 100)}%.`}
        </p>
        {artifactId && (
          <p className="mt-2 text-fg-subtle">Đã đúc bản dữ liệu cho engine thiết kế.</p>
        )}
      </div>

      {score.missing.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <p className="font-medium">Còn thiếu ({score.missing.length})</p>
          <ul className="mt-2 space-y-1">
            {score.missing.map((item) => (
              <li key={item.path}>
                <a
                  href={`#brief-${item.path.replace(/\./g, '-')}`}
                  className="flex min-h-10 items-center text-brand hover:underline"
                >
                  {item.label}
                  <span className="ml-1 text-fg-subtle">— {item.sectionTitle}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <p className="font-medium">Chỗ chưa nhất quán ({issues.length})</p>
          <ul className="mt-2 space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className={
                  issue.severity === 'nghiem_trong' ? 'text-status-overdue' : 'text-status-pending'
                }
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

/**
 * Kích thước trong đầu bài lệch với biên bản khảo sát.
 *
 * Hiện CẢ HAI con số chứ không im lặng lấy một bên: khách nói một đằng, đo thực tế một nẻo
 * là chuyện thường, và người quyết định phải nhìn thấy cả hai mới quyết được.
 */
function SurveyMismatch({
  brief,
  survey,
}: {
  brief: DesignBriefRecord;
  survey: { id: string; land_width: string | null; land_depth: string | null } | undefined;
}) {
  if (!survey || brief.site_source_survey_id !== survey.id) return null;

  const site = (brief.structured?.site ?? {}) as { width_m?: number; depth_m?: number };
  const differs =
    (survey.land_width !== null && Number(survey.land_width) !== site.width_m) ||
    (survey.land_depth !== null && Number(survey.land_depth) !== site.depth_m);
  if (!differs) return null;

  return (
    <p className="mb-4 rounded border border-border bg-surface-sunken p-3 text-status-pending">
      Kích thước trong đầu bài ({site.width_m ?? EM_DASH} × {site.depth_m ?? EM_DASH} m) khác biên
      bản khảo sát ({survey.land_width ?? EM_DASH} × {survey.land_depth ?? EM_DASH} m). Xác nhận lại
      số nào dùng để thiết kế.
    </p>
  );
}

function ReadOnlyField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="whitespace-pre-wrap">{value ?? EM_DASH}</dd>
    </div>
  );
}

/** Giá trị trong payload → chuỗi đọc được. Không dịch mã ở đây; nhãn nằm ở cấu hình. */
/**
 * Một giá trị đã lưu, viết ra bằng tiếng Việt.
 *
 * Phải BIẾT TRƯỜNG mới viết đúng: cùng một chuỗi `"bedroom"` là "Phòng ngủ" ở danh sách
 * không gian và là một vai trò khác ở chỗ khác; một cặp số là khoảng ngân sách ở đây và là
 * kích thước ở chỗ khác. Bản trước đổ thẳng giá trị ra màn hình nên hiện `nha_pho`,
 * `[object Object]` và `2000000000` — mã máy giữa một màn hình tiếng Việt (CLAUDE.md 4.1),
 * đúng thứ nhân sự NVG không đọc được.
 */
function describeField(field: BriefFormField, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;

  const label = (raw: unknown): string => {
    const found = field.options?.find((option) => String(option.value) === String(raw));
    return found ? found.label : String(raw);
  };

  if (field.control === 'money_range') {
    const [low, high] = value as (number | null)[];
    if (low === null && high === null) return null;
    return `${formatCurrency(low ?? 0)} – ${formatCurrency(high ?? 0)}`;
  }

  if (field.control === 'family') {
    const members = value as {
      role?: string;
      count?: number;
      floor_pref?: string | null;
      needs?: string[];
    }[];
    if (!members.length) return null;
    return members
      .map((member) => {
        const role = FAMILY_ROLE_LABEL[member.role as FamilyRole] ?? member.role ?? '';
        const parts = [`${role}: ${member.count ?? 0} người`];
        if (member.floor_pref) {
          parts.push(FLOOR_PREF_LABEL[member.floor_pref as FloorPref] ?? member.floor_pref);
        }
        if (member.needs?.length) parts.push(member.needs.map(label).join(', '));
        return parts.join(' · ');
      })
      .join(' | ');
  }

  if (field.control === 'sides') {
    const sides = value as Record<string, unknown>;
    const parts = ACCESS_SIDES.filter((side) => sides[side]).map(
      (side) => `${SIDE_LABEL[side]}: ${String(sides[side])}`,
    );
    return parts.length ? parts.join(' · ') : null;
  }

  if (Array.isArray(value)) return value.length ? value.map(label).join(', ') : null;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';

  if (typeof value === 'object') {
    // Đi qua bảng nhãn chứ không đổ thẳng ra chuỗi: người quyết định cuối lưu dưới dạng
    // `{ relationship: 'chu_nha' }`, và bỏ bước này thì màn hình hiện đúng chữ `chu_nha`.
    const parts = Object.values(value as Record<string, unknown>)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => label(v));
    return parts.length ? parts.join(' · ') : null;
  }

  return label(value);
}
