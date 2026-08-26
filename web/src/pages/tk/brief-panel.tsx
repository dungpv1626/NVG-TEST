/**
 * Tab Đầu bài của Chi tiết Dự án thiết kế (TK-01).
 *
 * TK-01 yêu cầu "một đầu bài ĐANG HIỆU LỰC duy nhất". Vì vậy màn hình này KHÔNG sửa tại chỗ:
 * mỗi lần lưu là một phiên bản mới, bản cũ lùi thành lịch sử và khoá lại. Sửa đè lên bản cũ
 * thì mất căn cứ trả lời "khách đổi yêu cầu lúc nào" — đúng câu hỏi hay phải trả lời nhất
 * khi phát sinh tranh cãi về khối lượng công việc.
 */

import { useState, type FormEvent } from 'react';
import { CheckCircle2, History } from 'lucide-react';
import { BUTTONS, formatCurrency, formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import {
  useConfirmDesignBrief,
  useDesignBriefs,
  useSaveDesignBrief,
  type DesignBriefRecord,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth } from '@/lib/auth';

const EM_DASH = '—';

interface BriefForm {
  designTask: string;
  functionalNeeds: string;
  budgetAmount: string;
  budgetNote: string;
  styleNote: string;
  siteCondition: string;
  legalDocuments: string;
  changeReason: string;
}

function toForm(brief: DesignBriefRecord | undefined): BriefForm {
  return {
    designTask: brief?.design_task ?? '',
    functionalNeeds: brief?.functional_needs ?? '',
    budgetAmount: brief?.budget_amount != null ? String(brief.budget_amount) : '',
    budgetNote: brief?.budget_note ?? '',
    styleNote: brief?.style_note ?? '',
    siteCondition: brief?.site_condition ?? '',
    legalDocuments: brief?.legal_documents ?? '',
    changeReason: '',
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
  const { profile } = useAuth();
  const { data: briefs, isLoading } = useDesignBriefs(projectId);
  const saveBrief = useSaveDesignBrief();
  const confirmBrief = useConfirmDesignBrief();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BriefForm>(() => toForm(undefined));
  const [error, setError] = useState<string | null>(null);

  const current = briefs?.find((b) => b.is_current_version);
  const history = (briefs ?? []).filter((b) => !b.is_current_version);

  function startEditing() {
    setForm(toForm(current));
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Bản thứ hai trở đi bắt buộc nêu nguyên nhân (NEN-05). Hỏi ngay tại chỗ thay vì để CSDL
    // trả lỗi rồi người dùng mới biết mình vừa gõ xong một biểu mẫu dài mà chưa lưu được.
    if (current && !form.changeReason.trim()) {
      setError('Vui lòng nêu nguyên nhân điều chỉnh đầu bài so với bản đang hiệu lực.');
      return;
    }

    try {
      await saveBrief.mutateAsync({
        projectId,
        companyId,
        designTask: form.designTask.trim() || null,
        functionalNeeds: form.functionalNeeds.trim() || null,
        budgetAmount: form.budgetAmount.trim() || null,
        budgetNote: form.budgetNote.trim() || null,
        styleNote: form.styleNote.trim() || null,
        siteCondition: form.siteCondition.trim() || null,
        legalDocuments: form.legalDocuments.trim() || null,
        changeReason: form.changeReason.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  if (isLoading) return null;

  if (editing) {
    const set = (field: keyof BriefForm) => (value: string) =>
      setForm((f) => ({ ...f, [field]: value }));

    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-lg border border-border bg-surface p-4 shadow-card"
      >
        <p className="mb-4 text-fg-subtle">
          {current
            ? `Lưu sẽ tạo phiên bản ${current.version + 1}. Bản ${current.version} chuyển thành lịch sử, không mất đi.`
            : 'Đây là bản đầu bài đầu tiên của dự án.'}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nhiệm vụ thiết kế" className="sm:col-span-2">
            <textarea
              value={form.designTask}
              onChange={(e) => set('designTask')(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              placeholder="Phạm vi công việc nhận làm: thiết kế kiến trúc, kết cấu, điện nước, hồ sơ xin phép…"
            />
          </Field>

          <Field label="Nhu cầu công năng" className="sm:col-span-2">
            <textarea
              value={form.functionalNeeds}
              onChange={(e) => set('functionalNeeds')(e.target.value)}
              rows={4}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              placeholder="Số tầng, số phòng ngủ, thành viên gia đình, thói quen sử dụng, yêu cầu riêng…"
            />
          </Field>

          <Field label="Ngân sách dự kiến" hint="Đơn vị đồng, không nhập dấu phân cách.">
            <Input
              value={form.budgetAmount}
              onChange={(e) => set('budgetAmount')(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
            />
          </Field>

          <Field label="Ghi chú về ngân sách">
            <Input
              value={form.budgetNote}
              onChange={(e) => set('budgetNote')(e.target.value)}
              placeholder="Đã gồm nội thất chưa, khoản nào tách riêng…"
            />
          </Field>

          <Field label="Phong cách kiến trúc" className="sm:col-span-2">
            <Input
              value={form.styleNote}
              onChange={(e) => set('styleNote')(e.target.value)}
              placeholder="Hiện đại, tân cổ điển, nhiệt đới…"
            />
          </Field>

          <Field label="Hiện trạng khu đất" className="sm:col-span-2">
            <textarea
              value={form.siteCondition}
              onChange={(e) => set('siteCondition')(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              placeholder="Kích thước, hướng, cốt nền, công trình lân cận, hạ tầng điện nước, đường vào…"
            />
          </Field>

          <Field label="Hồ sơ pháp lý" className="sm:col-span-2">
            <textarea
              value={form.legalDocuments}
              onChange={(e) => set('legalDocuments')(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              placeholder="Sổ đỏ, chỉ giới xây dựng, mật độ, tầng cao cho phép, giấy phép xây dựng…"
            />
          </Field>

          {current && (
            <Field
              label="Nguyên nhân điều chỉnh"
              required
              className="sm:col-span-2"
              hint="Vì sao đầu bài phải đổi — căn cứ này là thứ trả lời được câu hỏi phát sinh sau này."
            >
              <textarea
                value={form.changeReason}
                onChange={(e) => set('changeReason')(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-status-overdue">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <Button type="submit" variant="primary" disabled={saveBrief.isPending}>
            {saveBrief.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    );
  }

  if (!current) {
    return (
      <EmptyState
        message="Chưa có đầu bài. Ghi nhận nhiệm vụ thiết kế, nhu cầu công năng, ngân sách và hiện trạng khu đất trước khi dựng phương án."
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

  return (
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
          <span className="ml-auto flex gap-2">
            {!readOnly && !current.confirmed_at && profile && (
              <Button
                variant="secondary"
                onClick={() =>
                  void confirmBrief.mutateAsync({ briefId: current.id, userId: profile.id })
                }
              >
                Xác nhận đầu bài
              </Button>
            )}
            {!readOnly && (
              <Button variant="secondary" onClick={startEditing}>
                Điều chỉnh đầu bài
              </Button>
            )}
          </span>
        </div>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <BriefField label="Nhiệm vụ thiết kế" value={current.design_task} wide />
          <BriefField label="Nhu cầu công năng" value={current.functional_needs} wide />
          <BriefField
            label="Ngân sách dự kiến"
            value={current.budget_amount != null ? formatCurrency(current.budget_amount) : null}
          />
          <BriefField label="Ghi chú ngân sách" value={current.budget_note} />
          <BriefField label="Phong cách kiến trúc" value={current.style_note} wide />
          <BriefField label="Hiện trạng khu đất" value={current.site_condition} wide />
          <BriefField label="Hồ sơ pháp lý" value={current.legal_documents} wide />
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
  );
}

function BriefField({
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
