/**
 * Tab Khảo sát hiện trạng của Chi tiết Dự án thiết kế (TK-02).
 *
 * KHÁC biên bản khảo sát của CRM-03: bảng kia là khảo sát THƯƠNG MẠI (nhu cầu, người quyết
 * định, ngân sách, điều kiện thương mại) do Kinh doanh làm trước khi báo giá. Đây là khảo
 * sát KỸ THUẬT do Thiết kế làm để dựng phương án — đo đạc, ảnh, ghi chú nhu cầu sử dụng.
 *
 * Nhiều biên bản trên một dự án là bình thường: khu đất thường phải đo lại sau khi phát
 * hiện sai khác với sổ, và mỗi lần đo là một biên bản riêng chứ không ghi đè lần trước.
 */

import { useState, type FormEvent } from 'react';
import { BUTTONS, formatDateTime, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useDesignSurveys, useCreateDesignSurvey } from '@/hooks/use-design-surveys';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSurveyPhotos } from '@/hooks/use-survey-photos';
import { useAuth } from '@/lib/auth';
import { SurveyPhotos } from './survey-photos';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

const EM_DASH = '—';

export function SurveyPanel({
  projectId,
  companyId,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const { data: surveys } = useDesignSurveys(projectId);
  const { data: photos } = useSurveyPhotos(projectId);
  const createSurvey = useCreateDesignSurvey();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    landWidth: '',
    landDepth: '',
    orientation: '',
    measurementNotes: '',
    surroundingNotes: '',
    usageNotes: '',
    notes: '',
  });

  /**
   * Diện tích tính từ chiều rộng × chiều sâu, không bắt nhập tay: hai người nhập ba con số
   * rời nhau thì sớm muộn có biên bản mà diện tích không khớp kích thước.
   */
  const computedArea =
    form.landWidth && form.landDepth ? String(Number(form.landWidth) * Number(form.landDepth)) : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.measurementNotes.trim() && !form.landWidth) {
      setError('Vui lòng nhập kích thước khu đất hoặc ghi chú đo đạc.');
      return;
    }

    try {
      await createSurvey.mutateAsync({
        projectId,
        companyId,
        surveyedBy: profile?.id ?? null,
        landWidth: form.landWidth || null,
        landDepth: form.landDepth || null,
        landArea: computedArea || null,
        orientation: form.orientation.trim() || null,
        measurementNotes: form.measurementNotes.trim() || null,
        surroundingNotes: form.surroundingNotes.trim() || null,
        usageNotes: form.usageNotes.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm({
        landWidth: '',
        landDepth: '',
        orientation: '',
        measurementNotes: '',
        surroundingNotes: '',
        usageNotes: '',
        notes: '',
      });
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1 font-medium">
        Biên bản khảo sát hiện trạng
        <SectionHelp {...DESIGN_HELP.survey} autoOpenKey="tk.khao-sat" />
      </p>

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly &&
        (adding ? (
          <form
            onSubmit={submit}
            noValidate
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <p className="mb-4 font-medium">Ghi nhận biên bản khảo sát</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Chiều rộng (m)">
                <Input
                  value={form.landWidth}
                  onChange={(e) => set('landWidth')(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                />
              </Field>

              <Field label="Chiều sâu (m)">
                <Input
                  value={form.landDepth}
                  onChange={(e) => set('landDepth')(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                />
              </Field>

              <Field label="Diện tích (m²)" hint="Tính tự động từ kích thước.">
                <Input value={computedArea} readOnly disabled />
              </Field>

              <Field label="Hướng nhà" hint="Ảnh hưởng trực tiếp tới giải pháp che nắng.">
                <Input
                  value={form.orientation}
                  onChange={(e) => set('orientation')(e.target.value)}
                  placeholder="Đông nam"
                />
              </Field>

              <Field label="Số liệu đo đạc" className="sm:col-span-3">
                <textarea
                  value={form.measurementNotes}
                  onChange={(e) => set('measurementNotes')(e.target.value)}
                  rows={3}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                  placeholder="Cốt nền, chênh cao, mốc giới, sai khác so với sổ…"
                />
              </Field>

              <Field label="Hiện trạng xung quanh" className="sm:col-span-3">
                <textarea
                  value={form.surroundingNotes}
                  onChange={(e) => set('surroundingNotes')(e.target.value)}
                  rows={3}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                  placeholder="Công trình lân cận, đường vào, hạ tầng điện nước, cây xanh, thoát nước…"
                />
              </Field>

              <Field label="Ghi chú nhu cầu sử dụng" className="sm:col-span-3">
                <textarea
                  value={form.usageNotes}
                  onChange={(e) => set('usageNotes')(e.target.value)}
                  rows={3}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                  placeholder="Điều chủ nhà nói tại chỗ về cách dùng từng khu vực…"
                />
              </Field>

              <Field label="Ghi chú khác" className="sm:col-span-3">
                <Input value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
              </Field>
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" disabled={createSurvey.isPending}>
                {BUTTONS.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {BUTTONS.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Ghi nhận biên bản khảo sát
          </Button>
        ))}

      {(surveys ?? []).length === 0 ? (
        <EmptyState message="Chưa có biên bản khảo sát hiện trạng. Đo đạc khu đất và ghi nhận nhu cầu sử dụng trước khi dựng phương án." />
      ) : (
        <ul className="space-y-3">
          {(surveys ?? []).map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <p className="font-medium">
                Khảo sát {formatDateTime(s.surveyed_at ?? s.created_at)}
                {s.surveyor ? (
                  <span className="ml-2 font-normal text-fg-subtle">{s.surveyor.full_name}</span>
                ) : null}
              </p>

              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-4">
                <SurveyField
                  label="Kích thước"
                  value={
                    s.land_width && s.land_depth
                      ? `${formatNumber(Number(s.land_width))} × ${formatNumber(Number(s.land_depth))} m`
                      : null
                  }
                />
                <SurveyField
                  label="Diện tích"
                  value={s.land_area ? `${formatNumber(Number(s.land_area))} m²` : null}
                />
                <SurveyField label="Hướng nhà" value={s.orientation} />
              </dl>

              <div className="mt-2 space-y-1">
                <SurveyBlock label="Số liệu đo đạc" value={s.measurement_notes} />
                <SurveyBlock label="Hiện trạng xung quanh" value={s.surrounding_notes} />
                <SurveyBlock label="Nhu cầu sử dụng" value={s.usage_notes} />
                <SurveyBlock label="Ghi chú khác" value={s.notes} />
              </div>

              <SurveyPhotos
                projectId={projectId}
                companyId={companyId}
                surveyId={s.id}
                photos={(photos ?? []).filter((p) => p.design_survey_id === s.id)}
                readOnly={readOnly}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SurveyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{value ?? EM_DASH}</dd>
    </div>
  );
}

function SurveyBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p>
      <span className="text-fg-subtle">{label}: </span>
      <span className="whitespace-pre-wrap">{value}</span>
    </p>
  );
}
