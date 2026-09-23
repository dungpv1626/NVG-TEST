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

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, FileDown, History, Ruler } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import {
  checkBriefConsistency,
  briefAreaBudget,
  isFieldVisible,
  scoreBrief,
  setAtPath,
  syncBedroomRows,
  withDerivedSiteDimensions,
  valueAtPath,
  visibleFields,
  type DesignBriefDraft,
} from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import {
  useConfirmBriefArtifact,
  useDesignBriefs,
  useBriefFormConfig,
  useDesignSetting,
  useSaveBriefDraft,
  useSaveDesignBrief,
  type DesignBriefRecord,
} from '@/hooks/use-design-projects';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { cn } from '@/lib/utils';
import { BriefField } from './brief-field';
import { describeField } from './brief-describe';
import { printBrief } from './brief-print';
import { SitePlanPreview } from './site-plan-preview';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

const EM_DASH = '—';

/**
 * Giờ:phút của dấu tự lưu.
 *
 * Tự dựng thay vì `toLocaleTimeString`: hàm đó theo ngôn ngữ và múi giờ của TRÌNH DUYỆT, nên
 * trên máy đặt tiếng Anh nó trả về "11:47 PM" giữa một màn hình tiếng Việt — đúng loại chữ
 * không nằm trong mã nguồn mà CLAUDE.md 4.1 cảnh báo. Định dạng 24 giờ theo CGD 4.3.
 */
function hhmm(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

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
  projectName,
  projectCode,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  /** Chỉ dùng cho tiêu đề bản in — màn hình đã có tên dự án ở phần đầu trang. */
  projectName: string;
  projectCode: string;
  readOnly: boolean;
}) {
  const { data: briefs, isLoading } = useDesignBriefs(projectId);
  const { data: surveys } = useDesignSurveys(projectId);
  const { data: thresholdRaw } = useDesignSetting('brief_completeness_min');
  /**
   * Cấu hình biểu mẫu HIỆU LỰC — bản gốc cộng phần quản trị viên đã sửa ở «Biểu mẫu đầu bài».
   * Mọi chỗ trong tệp này đọc `form` chứ không đọc `form`: chấm điểm, soát mâu thuẫn,
   * chia bước và bản in phải cùng nhìn một bộ câu hỏi.
   */
  const { config: form } = useBriefFormConfig();

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
  /**
   * Bước đang mở, giữ theo MÃ mục chứ không theo số thứ tự.
   *
   * `null` = bước đầu. Giữ theo số thì đổi loại hình sang nhà phố — vốn làm biến mất hẳn một
   * bước ở giữa — sẽ đẩy người dùng sang một bước khác hẳn cái họ đang xem.
   */
  const [stepId, setStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Có gì chưa ghi xuống CSDL không.
   *
   * Trước đây hàng rào «rời trang?» gắn thẳng vào `editing`, nên nó hỏi cả khi vừa mở biểu
   * mẫu ra và chưa gõ gì. Cảnh báo nổ lúc không có gì để mất là cách chắc chắn nhất dạy
   * người dùng bấm «Rời khỏi» theo phản xạ — đến lúc cảnh báo thật thì nó không còn tác dụng.
   */
  const [dirty, setDirty] = useState(false);
  /**
   * Đếm số lần sửa — để `persist()` biết bản nó vừa ghi có còn là bản mới nhất không.
   *
   * Lời ghi mất 200–800 ms; gõ tiếp trong khoảng đó rồi `setDirty(false)` vô điều kiện là
   * coi phần vừa gõ như đã lưu: nhãn báo «Đã lưu», rời trang không hỏi, và phần đó mất. Nặng
   * hơn với «Lưu nháp»: đóng biểu mẫu xong `useEffect` nạp lại bản đã lưu, phần vừa sửa biến
   * mất ngay trên màn hình (rà soát 08/09/2026).
   */
  const edits = useRef(0);
  /** Đang hỏi «Bỏ các thay đổi chưa lưu?» sau khi bấm Hủy lúc còn thay đổi. */
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  /**
   * Mã bản ghi mà chính phiên nhập này vừa tạo ra ở lần lưu đầu.
   *
   * Cần vì `current` đến từ một truy vấn: tạo xong thì danh sách đầu bài còn đang tải lại,
   * nên `current` vẫn rỗng thêm một nhịp. Không có mã này thì lần tự lưu ngay sau đó lại đi
   * vào nhánh «tạo mới» và đẻ thêm một phiên bản.
   */
  const [draftBriefId, setDraftBriefId] = useState<string | null>(null);
  /** Thời điểm ghi thành công gần nhất — để người dùng THẤY là đã lưu, không phải đoán. */
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Chỉ nạp lại khi ĐỔI bản ghi, không phải mỗi lần vẽ lại: nạp lại giữa chừng là xoá những
  // gì người dùng vừa gõ (Webapp Flow 6.3).
  useEffect(() => {
    if (editing) return;
    setDraft((current?.structured as DesignBriefDraft) ?? {});
    setLegacy(toLegacy(current));
    setSurveyId(current?.site_source_survey_id ?? null);
  }, [current, editing]);

  useUnsavedChangesGuard(editing && dirty);

  // `form` nằm trong danh sách phụ thuộc: cấu hình biểu mẫu đổi giữa chừng khi quản trị viên
  // vừa lưu lớp phủ và lượt đọc `design_setting` về sau bản vẽ đầu tiên. Bỏ nó ra thì màn hình
  // giữ nguyên bộ câu hỏi cũ cho tới lần gõ tiếp theo — và điểm độ đầy đủ chấm theo bộ cũ.
  const score = useMemo(() => scoreBrief(draft, form), [draft, form]);
  /**
   * Bản MỚI NHẤT của những gì `persist()` cần — đọc qua ref, không qua closure.
   *
   * `save()` gọi `persist()` lần hai khi lượt đầu về trạng thái `stale`; nếu đọc `draft` từ
   * closure thì lượt hai ghi lại đúng bản cũ mà lượt đầu vừa ghi, và phần gõ thêm vẫn mất.
   */
  const latest = useRef({ draft, legacy, surveyId, changeReason, draftBriefId });
  latest.current = { draft, legacy, surveyId, changeReason, draftBriefId };
  const areaBudget = useMemo(() => briefAreaBudget(draft), [draft]);
  const issues = useMemo(() => checkBriefConsistency(draft, form, legacy), [draft, legacy, form]);
  const shown = useMemo(() => visibleFields(form, draft), [draft, form]);
  const threshold = typeof thresholdRaw === 'number' ? thresholdRaw : null;

  /** Bản đã xác nhận là bất biến — sửa nó nghĩa là lập phiên bản mới. */
  const needsNewVersion = Boolean(current?.confirmed_at);

  function startEditing() {
    setStepId(null);
    // Đồng bộ NGAY lúc mở, không chờ người dùng đụng vào phần Thành viên gia đình: đầu bài
    // đã lưu trước 07/09/2026 chưa có dòng phòng ngủ nào, nên mở ra sẽ thấy một danh sách
    // không gian thiếu hẳn phòng ngủ và không hiểu vì sao.
    setDraft(withDerived((current?.structured as DesignBriefDraft) ?? {}));
    setLegacy(toLegacy(current));
    setSurveyId(current?.site_source_survey_id ?? null);
    setChangeReason('');
    setError(null);
    setDirty(false);
    setDraftBriefId(null);
    setSavedAt(null);
    setConfirmingCancel(false);
    edits.current = 0;
    setEditing(true);
  }

  function setField(path: string, value: unknown) {
    setDirty(true);
    edits.current += 1;
    if (path.startsWith('legacy.')) {
      const column = LEGACY_COLUMNS[path]!;
      setLegacy((prev) => ({ ...prev, [column]: (value as string | undefined) ?? null }));
      return;
    }
    // Đổi Thành viên gia đình là đổi SỐ phòng ngủ, nên danh sách không gian phải theo ngay —
    // đó là toàn bộ lý do hai chỗ này không phải hai lần khai. Chạy sau khi ghi giá trị mới
    // chứ không trước, nếu không nó đồng bộ theo số cũ.
    setDraft((prev) => withDerived(setAtPath(prev, path, value)));
  }

  /**
   * Danh sách không gian mang đúng bấy nhiêu dòng phòng ngủ mà gia đình sinh ra.
   *
   * `syncBedroomRows` trả về CHÍNH mảng cũ khi không có gì đổi, nên gõ một ký tự vào ô khác
   * không biến thành "đầu bài vừa đổi" — hộp thoại «rời trang?» chỉ nổ khi thật sự có thay đổi.
   */
  function withSyncedBedrooms(next: DesignBriefDraft): DesignBriefDraft {
    const rows = syncBedroomRows(next);
    return rows === next.required_spaces ? next : { ...next, required_spaces: rows };
  }

  /**
   * Hai phép SUY chạy sau mỗi lần sửa, cùng một quy ước: trả về chính đối tượng cũ khi không
   * có gì đổi, nên gõ một ký tự vào ô bất kỳ không biến thành "đầu bài vừa đổi".
   *
   * Thứ tự không quan trọng — một phép chạm `required_spaces`, phép kia chạm `site`.
   */
  function withDerived(next: DesignBriefDraft): DesignBriefDraft {
    return withDerivedSiteDimensions(withSyncedBedrooms(next));
  }

  /**
   * Mở cửa sổ in bản đầu bài.
   *
   * In theo `draft` chứ không theo `current.structured`: hai thứ này giống nhau ở chế độ xem,
   * nhưng in ra thứ đang KHÔNG hiện trên màn hình là cách chắc chắn nhất để người dùng mất
   * lòng tin vào cả bản in.
   */
  function exportPdf() {
    printBrief({
      projectName,
      projectCode,
      draft,
      legacy,
      version: current?.version ?? 1,
      confirmedAt: current?.confirmed_at ?? null,
      score,
      issues,
      threshold,
      config: form,
    });
  }

  /** Chép kích thước lô từ biên bản khảo sát — không gõ lại con số đã có (PRD 2.3). */
  function copyFromSurvey() {
    if (!survey) return;
    let next = draft;
    if (survey.land_width) next = setAtPath(next, 'site.width_m', Number(survey.land_width));
    if (survey.land_depth) next = setAtPath(next, 'site.depth_m', Number(survey.land_depth));
    setDraft(next);
    setSurveyId(survey.id);
    setDirty(true);
    edits.current += 1;
  }

  /**
   * Ghi đầu bài xuống CSDL. Trả về `true` khi đã ghi xong.
   *
   * Tách khỏi `save()` để bước chuyển trang gọi lại được mà KHÔNG đóng biểu mẫu: «Tiếp» phải
   * lưu, nhưng lưu xong người dùng vẫn phải ở nguyên trong biểu mẫu.
   */
  /**
   * Ghi bản nháp đang có. `'ok'` = ghi xong và không ai gõ thêm trong lúc chờ; `'stale'` = ghi
   * xong nhưng đã có sửa mới, `dirty` giữ nguyên; `'failed'` = lỗi, câu lỗi đã đặt.
   */
  async function persist(): Promise<'ok' | 'stale' | 'failed'> {
    setError(null);
    const seen = edits.current;
    // Che các biến cùng tên của component một cách có chủ ý: trong hàm này chỉ được đọc bản
    // mới nhất (xem `latest`), không đọc bản closure của lần render đã gọi hàm.
    const { draft, legacy, surveyId, changeReason, draftBriefId } = latest.current;
    const score = scoreBrief(draft, form);

    // Điểm ghi vào payload để cột sinh trong CSDL có giá trị hiển thị ngay. Con số quyết
    // định Lớp 2 thì Worker tự tính lại khi xác nhận — cái này chỉ để lọc và hiện.
    const payload: DesignBriefDraft = {
      ...draft,
      completeness_score: score.score,
      missing_fields: score.missingFields,
    };

    try {
      // Đọc `draftBriefId` khi `current` còn rỗng — xem chú thích ở chỗ khai biến.
      const editingId = current?.id ?? draftBriefId;

      if (needsNewVersion || !editingId) {
        if (current && !changeReason.trim()) {
          setError('Vui lòng nêu nguyên nhân điều chỉnh đầu bài so với bản đang hiệu lực.');
          return 'failed';
        }
        const created = await saveNewVersion.mutateAsync({
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
        setDraftBriefId(created.id);
      } else {
        await saveDraft.mutateAsync({
          briefId: editingId,
          structured: payload,
          legacy,
          siteSourceSurveyId: surveyId,
        });
      }
      setSavedAt(new Date());
      if (edits.current !== seen) return 'stale';
      setDirty(false);
      return 'ok';
    } catch (e) {
      setError(toUserMessage(e, 'create'));
      return 'failed';
    }
  }

  async function save() {
    // Có sửa trong lúc chờ thì ghi thêm một lượt nữa thay vì đóng biểu mẫu với bản cũ.
    let result = await persist();
    if (result === 'stale') result = await persist();
    if (result === 'ok') setEditing(false);
  }

  function cancelEditing() {
    if (dirty) setConfirmingCancel(true);
    else setEditing(false);
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
    const saving = saveNewVersion.isPending || saveDraft.isPending;
    // Bản đã xác nhận thì KHÔNG có khái niệm "lưu nháp" — mọi lần ghi đều lập phiên bản mới.
    const saveLabel = needsNewVersion ? 'Lưu đầu bài' : 'Lưu nháp';

    const issuesFor = (path: string) =>
      issues.filter((i) => i.paths.includes(path)).map((i) => i.message);

    // Bước = MỤC đang có ít nhất một ô hiện ra. Không khai riêng danh sách bước trong cấu
    // hình: khai hai lần thì thêm một mục mà quên thêm bước sẽ làm mục đó biến mất khỏi biểu
    // mẫu mà không có gì báo. Nhà phố ẩn hẳn mục «Tổ chức khối nhà» nên còn năm bước.
    const steps = form.sections
      .map((section) => ({
        section,
        fields: shown.filter((v) => v.section.id === section.id),
      }))
      .filter((step) => step.fields.length > 0);

    // Giữ theo MÃ mục, không theo số thứ tự: đổi loại hình sang nhà phố làm biến mất một bước
    // ở giữa, và giữ theo số thì người dùng bị nhảy sang một mục khác hẳn cái đang xem.
    //
    // Bước đang xem biến mất (đang ở «Tổ chức khối nhà» rồi đổi sang nhà phố) thì đi tới bước
    // còn lại GẦN NHẤT theo thứ tự cấu hình, không quay về bước 1: mất chỗ đứng giữa một biểu
    // mẫu sáu bước là thứ người dùng phải trả giá cho một cú bấm ở bước khác.
    const order = form.sections.findIndex((section) => section.id === stepId);
    const index = Math.max(
      0,
      steps.findIndex((step) => step.section.id === stepId) !== -1
        ? steps.findIndex((step) => step.section.id === stepId)
        : steps.findIndex(
            (step) => form.sections.findIndex((s) => s.id === step.section.id) >= order,
          ),
    );
    const step = steps[index];
    if (!step) return null;
    const missingIn = (sectionId: string) =>
      score.missing.filter((item) => item.sectionId === sectionId && !item.optional).length;

    /**
     * Đổi bước — VÀ lưu những gì vừa gõ.
     *
     * "Tự lưu nháp" là ràng buộc cứng (Webapp Flow 6.3, CLAUDE.md 5.4), và biểu mẫu nhiều
     * bước là chỗ nó cần nhất: người dùng đọc thanh tiến trình rồi hiểu là đã sang phần
     * khác, nên không còn lý do gì để bấm «Lưu nháp» nữa. Không tự lưu thì mọi thứ chỉ nằm
     * trong bộ nhớ trình duyệt cho tới bước cuối — tải lại trang là mất sạch.
     *
     * Ghi nền, không chặn: người dùng sang bước mới ngay, còn lời gọi đi tiếp phía sau. Hỏng
     * thì câu lỗi hiện ngay dưới các nút và `dirty` vẫn bật, nên lần đổi bước sau lưu lại.
     *
     * ⚠️ Bản ĐÃ xác nhận thì KHÔNG tự lưu. Ở đó mỗi lần lưu là một phiên bản mới bắt buộc
     * nêu nguyên nhân (NEN-05); tự lưu sẽ đẻ năm phiên bản cho một lượt đi hết biểu mẫu và
     * làm dấu vết "khách đổi yêu cầu lúc nào" mất hẳn nghĩa.
     *
     * Đang có lời ghi dở thì bỏ qua lượt này: hai lệnh tạo chồng nhau sinh ra hai bản ghi.
     * `dirty` chưa tắt nên lần đổi bước kế tiếp lưu bù.
     */
    const goTo = (sectionId: string, path?: string) => {
      if (dirty && !needsNewVersion && !saving) void persist();
      setStepId(sectionId);
      if (!path) return;
      // Đợi bước mới vẽ xong rồi mới cuộn — ô cần tới chưa tồn tại trong DOM ở lượt này.
      requestAnimationFrame(() => {
        document.getElementById(`brief-${path.replace(/\./g, '-')}`)?.scrollIntoView({
          block: 'center',
        });
      });
    };

    const fieldsOf = (list: typeof step.fields) =>
      list.map(({ field }) => (
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
          projectId={projectId}
          floors={draft.floors ?? 1}
          family={draft.family}
          areaBudget={field.path === 'required_spaces' ? areaBudget : undefined}
        />
      ));

    const last = index === steps.length - 1;

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <StepBar steps={steps} index={index} missingIn={missingIn} onGo={goTo} />

          <section
            key={step.section.id}
            id={`brief-section-${step.section.id}`}
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <h3 className="font-semibold">{step.section.title}</h3>
            {step.section.hint && <p className="mt-0.5 text-fg-subtle">{step.section.hint}</p>}
            {/*
              Bản vẽ thửa đất và nút chép số đo đi theo TRƯỜNG kích thước lô, không theo MÃ
              MỤC. Gộp mục hay đổi tên mục là việc của `brief-form.json`, và nó không được
              làm biến mất bản vẽ một cách lặng lẽ — đúng chỗ đợt gộp 12 mục còn 6 (21/09/2026)
              suýt hỏng.
            */}
            {step.fields.some((v) => v.field.path === 'site.width_m') ? (
              <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-4">{fieldsOf(step.fields)}</div>
                <div className="md:sticky md:top-4 md:self-start">
                  <SitePlanPreview site={draft.site} />
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-4">{fieldsOf(step.fields)}</div>
            )}

            {step.fields.some((v) => v.field.path === 'site.width_m') && survey && (
              <Button variant="secondary" className="mt-3" onClick={copyFromSurvey}>
                <Ruler className="size-4" />
                Lấy theo biên bản khảo sát {formatDateTime(survey.surveyed_at ?? survey.created_at)}
              </Button>
            )}
          </section>

          {/* Hiện ở MỌI bước, không chỉ bước cuối. «Lưu nháp» giữa chừng của một bản đã xác
              nhận vẫn lập phiên bản mới, nên vẫn đòi nguyên nhân — mà ô để nhập nguyên nhân
              lại chỉ có ở bước cuối. Người dùng nhận đúng câu «Vui lòng nêu nguyên nhân» kèm
              một màn hình không có chỗ nào nêu được: một ngõ cụt kín. */}
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

          {/* Đúng MỘT hành động chính mỗi màn hình (CGD 6.3): đang giữa chừng thì đó là
              «Tiếp», tới bước cuối mới là «Lưu». «Lưu nháp» vẫn có ở mọi bước — bỏ dở giữa
              chừng là chuyện thường, và bắt đi hết sáu bước mới được lưu là cách chắc chắn
              để mất dữ liệu đã gõ. */}
          <div className="flex flex-wrap items-center gap-2">
            {index > 0 && (
              <Button variant="secondary" onClick={() => goTo(steps[index - 1]!.section.id)}>
                <ChevronLeft className="size-4" />
                Quay lại
              </Button>
            )}
            {last ? (
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Đang lưu…' : saveLabel}
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => goTo(steps[index + 1]!.section.id)}>
                  Tiếp
                  <ChevronRight className="size-4" />
                </Button>
                <Button variant="secondary" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Đang lưu…' : saveLabel}
                </Button>
              </>
            )}
            <Button variant="subtle" onClick={cancelEditing}>
              Hủy
            </Button>
            {/* Tự lưu mà không nói gì thì người dùng vẫn phải đoán, và vẫn bấm «Lưu nháp»
                cho chắc — đúng thứ việc tự lưu sinh ra để bỏ đi. */}
            <span aria-live="polite" className="text-fg-subtle">
              {saving
                ? 'Đang lưu…'
                : dirty
                  ? 'Có thay đổi chưa lưu'
                  : savedAt
                    ? `Đã lưu lúc ${hhmm(savedAt)}`
                    : ''}
            </span>
          </div>
          {/* «Hủy» lúc còn thay đổi phải hỏi: sáu bước, và bản đã xác nhận không tự lưu khi
              đổi bước — bấm nhầm nút nằm ngay cạnh «Lưu» là mất cả buổi khai (AFD 6.3). Hộp
              tự dựng, không `window.confirm`: nút của hộp gốc theo tiếng của trình duyệt. */}
          {confirmingCancel && (
            <div
              role="alertdialog"
              aria-labelledby="brief-cancel-title"
              className="mt-3 rounded-sm border border-border bg-surface-sunken p-3"
            >
              <p id="brief-cancel-title" className="font-medium">
                Bỏ các thay đổi chưa lưu?
              </p>
              <p className="mt-0.5 text-fg-subtle">
                Những gì đã sửa từ lần lưu gần nhất sẽ mất.
                {needsNewVersion ? ' Bản đã xác nhận không tự lưu khi đổi bước.' : ''}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmingCancel(false);
                    setEditing(false);
                  }}
                >
                  Bỏ thay đổi
                </Button>
                <Button variant="subtle" onClick={() => setConfirmingCancel(false)}>
                  Tiếp tục sửa
                </Button>
              </div>
            </div>
          )}
        </div>

        <CompletenessPanel
          score={score}
          issues={issues}
          threshold={threshold}
          onJump={(sectionId, path) => goTo(sectionId, path)}
        />
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
            <p className="flex items-center gap-1 font-medium">
              Đầu bài đang hiệu lực — phiên bản {current.version}
              <SectionHelp {...DESIGN_HELP.brief} autoOpenKey="tk.dau-bai" />
            </p>
            {current.confirmed_at ? (
              <span className="inline-flex items-center gap-1 text-status-completed">
                <CheckCircle2 className="size-4" />
                Đã xác nhận {formatDateTime(current.confirmed_at)}
              </span>
            ) : (
              <span className="text-status-pending">Chưa xác nhận</span>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              {/* Hiện CẢ ở chế độ chỉ xem — người cần bản in mang đi gặp khách thường đúng là
                  người không còn quyền sửa hồ sơ. Cùng lý lẽ với nút của biên bản khảo sát. */}
              <Button variant="subtle" onClick={exportPdf}>
                <FileDown className="size-4" />
                Xuất PDF
              </Button>
              {!readOnly && !current.confirmed_at && (
                <Button
                  variant="secondary"
                  onClick={() => void confirm()}
                  disabled={confirmArtifact.isPending}
                >
                  {confirmArtifact.isPending ? 'Đang xác nhận…' : 'Xác nhận đầu bài'}
                </Button>
              )}
              {!readOnly && (
                <Button variant="secondary" onClick={startEditing}>
                  {current.confirmed_at ? 'Điều chỉnh đầu bài' : 'Sửa đầu bài'}
                </Button>
              )}
            </span>
          </div>

          {/* Cùng ô `error` mà chế độ nhập dùng, nhưng trước đây CHỈ chế độ nhập vẽ nó ra.
              «Xác nhận đầu bài» chạy ở chế độ xem, nên mọi câu nó trả về — thiếu trường bắt
              buộc, không đủ quyền, dịch vụ thiết kế không phản hồi — đều được đặt vào state
              rồi rơi thẳng xuống đất. Người dùng bấm nút và KHÔNG có gì xảy ra: không kết
              quả, không lỗi, không dấu hiệu đang chạy. */}
          {error && (
            <p role="alert" className="mb-3 text-status-overdue">
              {error}
            </p>
          )}

          <SurveyMismatch brief={current} survey={survey} />

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {/*
              Lọc bằng ĐÚNG hàm mà biểu mẫu dùng: câu hỏi chỉ dành cho biệt thự không được
              hiện ở chế độ xem của một hồ sơ nhà phố, dù chỉ hiện dấu gạch ngang. Một danh
              sách trường trống kéo dài làm người đọc tưởng hồ sơ còn thiếu.
            */}
            {form.sections.flatMap((section) =>
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
                    value={describeField(
                      field,
                      valueAtPath(current.structured, field.path),
                      current.structured?.family,
                    )}
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
 * Thanh tiến trình của biểu mẫu nhiều bước (AFD 4.6 mẫu 4).
 *
 * Ba việc, và cái thứ ba là lý do nó không chỉ là một dãy chấm tròn:
 *
 *  1. Nói đang ở đâu trong bao nhiêu bước.
 *  2. **Đi thẳng tới bước bất kỳ.** Bảng khảo sát này thường được điền dở rồi quay lại bổ
 *     sung đúng một chỗ; bắt bấm «Tiếp» năm lần để tới đó là lý do người ta bỏ sang Excel.
 *  3. Nói bước nào CÒN THIẾU, ngay trên thanh. Không có nó thì phải mở từng bước mới biết,
 *     và danh sách «Còn thiếu» ở cột phải là nơi duy nhất nhìn thấy điều đó.
 *
 * Số câu còn thiếu chỉ đếm ô BẮT BUỘC: gắn dấu cho một bước chỉ vì còn ô «(tùy chọn)» chưa
 * điền là dạy người dùng bỏ qua chính dấu đó.
 */
function StepBar({
  steps,
  index,
  missingIn,
  onGo,
}: {
  steps: { section: { id: string; title: string } }[];
  index: number;
  missingIn: (sectionId: string) => number;
  onGo: (sectionId: string) => void;
}) {
  return (
    <nav
      aria-label="Các bước của đầu bài"
      className="rounded-lg border border-border bg-surface p-3 shadow-card"
    >
      <ol className="flex flex-wrap gap-1">
        {steps.map((step, i) => {
          const current = i === index;
          const missing = missingIn(step.section.id);
          return (
            <li key={step.section.id}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onGo(step.section.id)}
                className={cn(
                  'flex min-h-10 items-center gap-2 rounded px-2.5 text-left',
                  current ? 'bg-brand-subtle font-semibold text-brand' : 'text-fg-subtle',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    current ? 'bg-brand text-white' : 'bg-surface-sunken',
                  )}
                >
                  {i + 1}
                </span>
                {step.section.title}
                {/* Chữ, không phải chỉ một chấm màu: màu không bao giờ là cách truyền đạt
                    duy nhất (CGD 6.8). */}
                {missing > 0 && (
                  <span className="rounded-full bg-status-pending-bg px-1.5 text-xs font-medium text-status-pending">
                    thiếu {missing}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 px-2.5 text-xs text-fg-subtle">
        Bước {index + 1} trên {steps.length}. Lưu nháp được ở bất kỳ bước nào.
      </p>
    </nav>
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
  onJump,
}: {
  score: ReturnType<typeof scoreBrief>;
  issues: ReturnType<typeof checkBriefConsistency>;
  threshold: number | null;
  artifactId?: string | null;
  /**
   * Nhảy tới một ô đang thiếu. Có vì biểu mẫu chia bước: ô cần tới thường nằm ở BƯỚC KHÁC,
   * và một liên kết `#neo` thuần chỉ cuộn trong bước đang mở — bấm vào không có gì xảy ra,
   * đúng kiểu hỏng im lặng. Vắng mặt ở chế độ chỉ xem, nơi mọi ô cùng nằm trên một trang.
   */
  onJump?: (sectionId: string, path: string) => void;
}) {
  const percent = Math.round(score.score * 100);
  // Đủ điểm mà còn mâu thuẫn NGHIÊM TRỌNG thì chưa dựng được: nhánh AI và Lớp 2 đều chặn ở
  // Worker (`brief/gate.ts`). Nói «đã đủ» ở đây là hứa một việc sẽ bị từ chối ngay khi bấm.
  const blocking = issues.filter((issue) => issue.severity === 'nghiem_trong').length;
  const enough = threshold !== null && score.score >= threshold && blocking === 0;
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
              : blocking > 0 && score.score >= threshold
                ? `Chưa dựng được phương án tự động — còn ${blocking} mâu thuẫn nghiêm trọng phải gỡ.`
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
                  onClick={
                    onJump
                      ? (event) => {
                          event.preventDefault();
                          onJump(item.sectionId, item.path);
                        }
                      : undefined
                  }
                  className="flex min-h-10 flex-wrap items-center gap-x-1 text-brand hover:underline"
                >
                  {item.label}
                  {item.optional && <span className="text-fg-subtle">(tùy chọn)</span>}
                  <span className="text-fg-subtle">— {item.sectionTitle}</span>
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
      Kích thước trong đầu bài (mặt tiền {site.width_m ?? EM_DASH} m × sâu {site.depth_m ?? EM_DASH}{' '}
      m) khác biên bản khảo sát ({survey.land_width ?? EM_DASH} × {survey.land_depth ?? EM_DASH} m).
      Xác nhận lại số nào dùng để thiết kế.
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
