/**
 * Tab Khảo sát của Chi tiết Cơ hội (PRD CRM-03).
 *
 * Webapp Flow 3.1 đặt bước này ngay trong tab: "Chi tiết Cơ hội — tab Khảo sát: Đặt lịch
 * khảo sát, ghi biên bản" — nên biểu mẫu nằm tại chỗ, không tách sang trang riêng như báo
 * giá. Biên bản khảo sát là một phần của hồ sơ cơ hội, không phải hồ sơ độc lập.
 *
 * Một cơ hội có thể khảo sát NHIỀU LẦN (sơ bộ rồi chi tiết), nên đây là danh sách chứ không
 * phải một biểu mẫu duy nhất.
 *
 * ⚠️ CHƯA LÀM: "ảnh hiện trạng" mà CRM-03 yêu cầu. Cần hạ tầng Supabase Storage (bucket +
 * policy + thành phần tải tệp) dùng chung với bản vẽ TK-05, dự toán DA-06 và hợp đồng
 * HD-01 — thuộc phần kho hồ sơ, không nên dựng riêng cho một tab.
 */

import { useState } from 'react';
import { CalendarClock, ClipboardCheck } from 'lucide-react';
import {
  BUTTONS,
  formatDateTime,
  fromNvgInput,
  toNvgDateInput,
  toNvgTimeInput,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useActiveUsers, type ActiveUser } from '@/hooks/use-active-users';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useScheduleSurvey,
  useSiteSurveys,
  useUpdateSurvey,
  type SiteSurveyRecord,
  type SurveyInput,
} from '@/hooks/use-site-surveys';
import { useAuth } from '@/lib/auth';

const EM_DASH = '—';

/** Giá trị rỗng của biểu mẫu — dùng chung cho cả tạo mới và làm mốc so sánh. */
const EMPTY_FORM = {
  scheduledAt: '',
  surveyedAt: '',
  surveyedBy: '',
  needs: '',
  decisionMaker: '',
  budgetNote: '',
  scheduleNote: '',
  commercialTerms: '',
  notes: '',
};

type SurveyForm = typeof EMPTY_FORM;

/**
 * Chuyển ISO của CSDL sang dạng `yyyy-MM-ddTHH:mm` mà `datetime-local` cần.
 *
 * Quy đổi theo MÚI GIỜ NGHIỆP VỤ chứ không theo múi giờ máy: mọi chỗ hiển thị khác dùng
 * `formatDateTime` vốn cố định ở `Asia/Ho_Chi_Minh`. Nếu ô nhập lấy giờ máy thì một người
 * mở máy đặt múi giờ khác sẽ thấy thẻ ghi 09:00 còn ô sửa ghi giờ khác cho cùng một bản ghi.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${toNvgDateInput(d)}T${toNvgTimeInput(d)}`;
}

function toPayload(form: SurveyForm): SurveyInput {
  const trimmed = (v: string) => v.trim() || null;
  return {
    // Chiều ngược lại của `toLocalInput` — cùng một múi giờ nghiệp vụ.
    scheduledAt: fromNvgInput(form.scheduledAt),
    surveyedAt: fromNvgInput(form.surveyedAt),
    surveyedBy: form.surveyedBy || null,
    needs: trimmed(form.needs),
    decisionMaker: trimmed(form.decisionMaker),
    budgetNote: trimmed(form.budgetNote),
    scheduleNote: trimmed(form.scheduleNote),
    commercialTerms: trimmed(form.commercialTerms),
    notes: trimmed(form.notes),
  };
}

/**
 * Bản nháp đang soạn, do trang CHA giữ.
 *
 * `EntityDetail` chỉ dựng nội dung của tab đang mở, nên component này bị gỡ khỏi cây React
 * ngay khi người dùng bấm sang tab khác — ví dụ mở tab Báo giá để tra lại con số trước khi
 * ghi biên bản. Nếu state nằm trong chính component thì cả biên bản đang gõ dở biến mất
 * không một lời cảnh báo, đúng thứ Webapp Flow 6.3 cấm ("KHÔNG bao giờ để mất dữ liệu đang
 * nhập"). Đưa lên trang cha — nơi không bị gỡ — thì quay lại tab là bản nháp vẫn còn.
 */
export interface SurveyDraft {
  /** `null` = đóng biểu mẫu; `''` = đang tạo mới; id = đang sửa biên bản đó. */
  editingId: string | null;
  form: SurveyForm;
}

export const EMPTY_SURVEY_DRAFT: SurveyDraft = { editingId: null, form: EMPTY_FORM };

export function SurveyPanel({
  opportunityId,
  canEdit,
  isHandedOver,
  draft,
  onDraftChange,
}: {
  opportunityId: string;
  canEdit: boolean;
  isHandedOver: boolean;
  draft: SurveyDraft;
  onDraftChange: (draft: SurveyDraft) => void;
}) {
  const { profile } = useAuth();
  const { data: surveys, isLoading, error, refetch } = useSiteSurveys(opportunityId);
  const { data: users } = useActiveUsers();

  const schedule = useScheduleSurvey();
  const update = useUpdateSurvey();

  const { editingId, form } = draft;
  const [actionError, setActionError] = useState<string | null>(null);

  const editable = canEdit && !isHandedOver;
  const busy = schedule.isPending || update.isPending;

  function openCreate() {
    setActionError(null);
    onDraftChange({ editingId: '', form: { ...EMPTY_FORM, surveyedBy: profile?.id ?? '' } });
  }

  function openEdit(survey: SiteSurveyRecord) {
    setActionError(null);
    onDraftChange({
      editingId: survey.id,
      form: {
        scheduledAt: toLocalInput(survey.scheduled_at),
        surveyedAt: toLocalInput(survey.surveyed_at),
        // Dùng id, KHÔNG tra ngược từ tên: hai nhân sự trùng tên sẽ gán nhầm người.
        surveyedBy: survey.surveyed_by ?? '',
        needs: survey.needs ?? '',
        decisionMaker: survey.decision_maker ?? '',
        budgetNote: survey.budget_note ?? '',
        scheduleNote: survey.schedule_note ?? '',
        commercialTerms: survey.commercial_terms ?? '',
        notes: survey.notes ?? '',
      },
    });
  }

  async function save() {
    setActionError(null);
    if (!form.scheduledAt && !form.surveyedAt) {
      setActionError('Vui lòng nhập lịch hẹn khảo sát hoặc thời điểm đã khảo sát.');
      return;
    }
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...toPayload(form) });
      } else {
        await schedule.mutateAsync({ opportunityId, ...toPayload(form) });
      }
      onDraftChange(EMPTY_SURVEY_DRAFT);
    } catch (e) {
      setActionError(toUserMessage(e, editingId ? 'edit' : 'create'));
    }
  }

  if (error) {
    return (
      <ErrorState
        message="Không tải được biên bản khảo sát. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={() => void refetch()}
        technicalDetail={error.message}
      />
    );
  }

  if (isLoading) return <TableSkeleton rows={2} columns={3} />;

  const list = surveys ?? [];

  return (
    <div className="space-y-4">
      {actionError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {actionError}
        </p>
      )}

      {editable && editingId === null && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={openCreate}>
            <CalendarClock />
            {list.length === 0 ? 'Đặt lịch khảo sát' : 'Đặt lịch khảo sát tiếp theo'}
          </Button>
        </div>
      )}

      {editingId !== null && (
        <SurveyForm
          form={form}
          users={users ?? []}
          busy={busy}
          isEditing={editingId !== ''}
          onChange={(field, value) =>
            onDraftChange({ editingId, form: { ...form, [field]: value } })
          }
          onSave={() => void save()}
          onCancel={() => onDraftChange(EMPTY_SURVEY_DRAFT)}
        />
      )}

      {list.length === 0 ? (
        <EmptyState message="Chưa có biên bản khảo sát. Đặt lịch khảo sát để ghi nhận nhu cầu, người quyết định, ngân sách và tiến độ." />
      ) : (
        <ol className="space-y-3">
          {list.map((survey) => (
            <SurveyCard
              key={survey.id}
              survey={survey}
              editable={editable && editingId === null}
              onEdit={() => openEdit(survey)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function SurveyCard({
  survey,
  editable,
  onEdit,
}: {
  survey: SiteSurveyRecord;
  editable: boolean;
  onEdit: () => void;
}) {
  // Đã khảo sát thì là BIÊN BẢN; chưa thì mới chỉ là LỊCH HẸN — hai thứ khác nhau về giá trị
  // nghiệp vụ, nên nói rõ ngay ở dòng đầu thay vì để người đọc tự suy.
  const done = survey.surveyed_at !== null;

  const content = [
    { label: 'Nhu cầu', value: survey.needs },
    { label: 'Người quyết định', value: survey.decision_maker },
    { label: 'Ngân sách', value: survey.budget_note },
    { label: 'Tiến độ mong muốn', value: survey.schedule_note },
    { label: 'Điều kiện thương mại', value: survey.commercial_terms },
    { label: 'Ghi chú', value: survey.notes },
  ].filter((f) => f.value);

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {done ? (
            <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-status-completed" />
          ) : (
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-status-progress" />
          )}
          <div className="min-w-0">
            <div className="font-semibold">
              {done ? 'Đã khảo sát' : 'Lịch hẹn khảo sát'}{' '}
              {formatDateTime(done ? survey.surveyed_at : survey.scheduled_at)}
            </div>
            <div className="text-xs text-fg-subtle">
              Người khảo sát: {survey.surveyor?.full_name ?? EM_DASH}
              {done && survey.scheduled_at && (
                <> · Hẹn lúc {formatDateTime(survey.scheduled_at)}</>
              )}
            </div>
          </div>
        </div>

        {editable && (
          <Button variant="subtle" size="sm" onClick={onEdit}>
            {done ? BUTTONS.edit : 'Ghi biên bản'}
          </Button>
        )}
      </div>

      {content.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {content.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-fg-subtle">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-fg-subtle">
          Chưa ghi nội dung khảo sát. Ghi biên bản sau buổi khảo sát để Phòng Dự án và Thiết kế
          không phải hỏi lại khách hàng.
        </p>
      )}
    </li>
  );
}

function SurveyForm({
  form,
  users,
  busy,
  isEditing,
  onChange,
  onSave,
  onCancel,
}: {
  form: SurveyForm;
  users: ActiveUser[];
  busy: boolean;
  isEditing: boolean;
  onChange: (field: keyof SurveyForm, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      noValidate
      className="rounded-lg border border-brand bg-surface p-4 shadow-card"
    >
      <h3 className="mb-3 font-semibold">
        {isEditing ? 'Biên bản khảo sát' : 'Đặt lịch khảo sát'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lịch hẹn khảo sát">
          <Input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => onChange('scheduledAt', e.target.value)}
          />
        </Field>

        <Field label="Người khảo sát">
          <select
            value={form.surveyedBy}
            onChange={(e) => onChange('surveyedBy', e.target.value)}
            className="h-9 w-full rounded-sm border border-border bg-surface px-3"
          >
            <option value="">Chưa phân công</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Đã khảo sát lúc"
          hint="Điền sau buổi khảo sát. Bỏ trống nghĩa là mới đặt lịch, chưa đi."
          className="sm:col-span-2"
        >
          <Input
            type="datetime-local"
            value={form.surveyedAt}
            onChange={(e) => onChange('surveyedAt', e.target.value)}
          />
        </Field>

        <Field label="Nhu cầu" className="sm:col-span-2">
          <textarea
            value={form.needs}
            onChange={(e) => onChange('needs', e.target.value)}
            rows={2}
            placeholder="Loại công trình, quy mô, công năng khách hàng cần"
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
          />
        </Field>

        <Field label="Người quyết định" hint="Người thật sự chốt, không phải người liên hệ.">
          <Input
            value={form.decisionMaker}
            onChange={(e) => onChange('decisionMaker', e.target.value)}
            placeholder="Họ tên và vai trò"
          />
        </Field>

        <Field label="Ngân sách">
          <Input
            value={form.budgetNote}
            onChange={(e) => onChange('budgetNote', e.target.value)}
            placeholder="Khoảng ngân sách khách nêu"
          />
        </Field>

        <Field label="Tiến độ mong muốn">
          <Input
            value={form.scheduleNote}
            onChange={(e) => onChange('scheduleNote', e.target.value)}
            placeholder="Thời điểm khởi công, thời hạn bàn giao"
          />
        </Field>

        <Field label="Điều kiện thương mại">
          <Input
            value={form.commercialTerms}
            onChange={(e) => onChange('commercialTerms', e.target.value)}
            placeholder="Đợt thanh toán, bảo lãnh, bảo hành"
          />
        </Field>

        <Field label="Ghi chú" className="sm:col-span-2">
          <textarea
            value={form.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            rows={2}
            placeholder="Hiện trạng mặt bằng, rủi ro nhận thấy, điểm cần lưu ý khi báo giá"
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? 'Đang lưu…' : BUTTONS.save}
        </Button>
        <Button type="button" variant="subtle" onClick={onCancel}>
          {BUTTONS.cancel}
        </Button>
      </div>
    </form>
  );
}
