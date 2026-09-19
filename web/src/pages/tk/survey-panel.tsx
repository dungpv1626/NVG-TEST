/**
 * Tab Khảo sát hiện trạng của Chi tiết Dự án thiết kế (TK-02).
 *
 * KHÁC biên bản khảo sát của CRM-03: bảng kia là khảo sát THƯƠNG MẠI (nhu cầu, người quyết
 * định, ngân sách, điều kiện thương mại) do Kinh doanh làm trước khi báo giá. Đây là khảo
 * sát KỸ THUẬT do Thiết kế làm để dựng phương án — đo đạc, ảnh, ghi chú nhu cầu sử dụng.
 *
 * Nhiều biên bản trên một dự án là bình thường: khu đất thường phải đo lại sau khi phát
 * hiện sai khác với sổ, và mỗi lần đo là một biên bản riêng chứ không ghi đè lần trước.
 *
 * **Sửa và gỡ là hai việc khác với đo lại.** Đo lại ra dữ liệu MỚI nên lập biên bản mới;
 * còn gõ nhầm hướng nhà thì không có buổi khảo sát nào cả, mà bản hỏng vẫn nằm lại cạnh bản
 * đúng và người đọc sau không biết tin bản nào. Nên sửa là sửa tại chỗ (giữ nguyên
 * `surveyed_at` — mốc đi đo không đổi vì gõ lại), và gỡ là xoá MỀM.
 */

import { useState, type FormEvent } from 'react';
import { FileDown, Pencil, Trash2 } from 'lucide-react';
import { BUTTONS, formatDateTime, formatNumber } from '@nvg/shared';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useDesignBriefs } from '@/hooks/use-design-projects';
import {
  useCreateDesignSurvey,
  useDesignSurveys,
  useRemoveDesignSurvey,
  useUpdateDesignSurvey,
  type DesignSurveyRecord,
} from '@/hooks/use-design-surveys';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSurveyPhotos, type SurveyPhotoRecord } from '@/hooks/use-survey-photos';
import { useAuth } from '@/lib/auth';
import { SurveyPhotos } from './survey-photos';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

const EM_DASH = '—';

interface SurveyFormValues {
  landWidth: string;
  landDepth: string;
  orientation: string;
  measurementNotes: string;
  surroundingNotes: string;
  usageNotes: string;
  notes: string;
}

const BLANK_FORM: SurveyFormValues = {
  landWidth: '',
  landDepth: '',
  orientation: '',
  measurementNotes: '',
  surroundingNotes: '',
  usageNotes: '',
  notes: '',
};

function toFormValues(s: DesignSurveyRecord): SurveyFormValues {
  return {
    landWidth: s.land_width ?? '',
    landDepth: s.land_depth ?? '',
    orientation: s.orientation ?? '',
    measurementNotes: s.measurement_notes ?? '',
    surroundingNotes: s.surrounding_notes ?? '',
    usageNotes: s.usage_notes ?? '',
    notes: s.notes ?? '',
  };
}

/** Không có biên bản nào đang mở ở chế độ ghi/sửa. */
type EditorMode =
  { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; survey: DesignSurveyRecord };

export function SurveyPanel({
  projectId,
  companyId,
  projectName,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  /** Tên dự án — chỉ dùng làm tiêu đề bản in. */
  projectName?: string;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const { data: surveys } = useDesignSurveys(projectId);
  const { data: photos } = useSurveyPhotos(projectId);
  const { data: briefs } = useDesignBriefs(projectId);
  const createSurvey = useCreateDesignSurvey();
  const updateSurvey = useUpdateDesignSurvey();
  const removeSurvey = useRemoveDesignSurvey();

  const [mode, setMode] = useState<EditorMode>({ kind: 'closed' });
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Biên bản mà đầu bài đang ghi là nguồn số đo. Gỡ nó KHÔNG bị chặn — dòng vẫn còn trong
   * CSDL và khoá ngoại vẫn trỏ tới — nhưng phải nói ra trước khi bấm, vì sau đó màn hình
   * Đầu bài không còn chỗ nào nhắc số đo đến từ đâu.
   */
  const briefSourceSurveyIds = new Set(
    (briefs ?? []).map((b) => b.site_source_survey_id).filter((id): id is string => Boolean(id)),
  );

  async function save(values: SurveyFormValues, computedArea: string) {
    setError(null);

    if (!values.measurementNotes.trim() && !values.landWidth) {
      setError('Vui lòng nhập kích thước khu đất hoặc ghi chú đo đạc.');
      return;
    }

    const payload = {
      landWidth: values.landWidth || null,
      landDepth: values.landDepth || null,
      landArea: computedArea || null,
      orientation: values.orientation.trim() || null,
      measurementNotes: values.measurementNotes.trim() || null,
      surroundingNotes: values.surroundingNotes.trim() || null,
      usageNotes: values.usageNotes.trim() || null,
      notes: values.notes.trim() || null,
    };

    try {
      if (mode.kind === 'edit') {
        await updateSurvey.mutateAsync({ surveyId: mode.survey.id, ...payload });
      } else {
        await createSurvey.mutateAsync({
          projectId,
          companyId,
          surveyedBy: profile?.id ?? null,
          ...payload,
        });
      }
      setMode({ kind: 'closed' });
    } catch (e) {
      setError(toUserMessage(e, mode.kind === 'edit' ? 'edit' : 'create'));
    }
  }

  async function remove(surveyId: string) {
    setError(null);
    try {
      await removeSurvey.mutateAsync({ surveyId });
      setRemoving(null);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

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

      {!readOnly && mode.kind === 'create' && (
        <SurveyForm
          title="Ghi nhận biên bản khảo sát"
          initial={BLANK_FORM}
          pending={createSurvey.isPending}
          onSubmit={save}
          onCancel={() => setMode({ kind: 'closed' })}
        />
      )}

      {!readOnly && mode.kind === 'closed' && (
        <Button variant="secondary" onClick={() => setMode({ kind: 'create' })}>
          Ghi nhận biên bản khảo sát
        </Button>
      )}

      {(surveys ?? []).length === 0 ? (
        <EmptyState
          message={
            readOnly
              ? 'Chưa có biên bản khảo sát hiện trạng. Biên bản do Phòng Thiết kế lập khi đi đo khu đất.'
              : 'Chưa có biên bản khảo sát hiện trạng. Đo đạc khu đất và ghi nhận nhu cầu sử dụng trước khi dựng phương án.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {(surveys ?? []).map((s) =>
            mode.kind === 'edit' && mode.survey.id === s.id ? (
              <li key={s.id}>
                <SurveyForm
                  title={`Sửa biên bản khảo sát ${formatDateTime(s.surveyed_at ?? s.created_at)}`}
                  initial={toFormValues(s)}
                  pending={updateSurvey.isPending}
                  onSubmit={save}
                  onCancel={() => setMode({ kind: 'closed' })}
                />
              </li>
            ) : (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    Khảo sát {formatDateTime(s.surveyed_at ?? s.created_at)}
                    {s.surveyor ? (
                      <span className="ml-2 font-normal text-fg-subtle">
                        {s.surveyor.full_name}
                      </span>
                    ) : null}
                  </p>

                  {mode.kind === 'closed' && removing !== s.id && (
                    <div className="flex shrink-0 gap-1">
                      {/*
                        Xuất PDF có CẢ ở chế độ chỉ xem: người cần mang biên bản ra công
                        trường thường đúng là người không còn quyền sửa hồ sơ.
                      */}
                      <Button
                        variant="subtle"
                        onClick={() =>
                          printSurvey(
                            s,
                            (photos ?? []).filter((p) => p.design_survey_id === s.id),
                            projectName,
                          )
                        }
                        aria-label={`Xuất PDF biên bản khảo sát ${formatDateTime(s.surveyed_at ?? s.created_at)}`}
                      >
                        <FileDown className="size-4" aria-hidden />
                        Xuất PDF
                      </Button>
                      {!readOnly && (
                        <>
                          <Button
                            variant="subtle"
                            onClick={() => setMode({ kind: 'edit', survey: s })}
                            aria-label={`Sửa biên bản khảo sát ${formatDateTime(s.surveyed_at ?? s.created_at)}`}
                          >
                            <Pencil className="size-4" aria-hidden />
                            Sửa
                          </Button>
                          <Button
                            variant="subtle"
                            onClick={() => setRemoving(s.id)}
                            aria-label={`Gỡ biên bản khảo sát ${formatDateTime(s.surveyed_at ?? s.created_at)}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                            Gỡ
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {removing === s.id && (
                  <ConfirmRemove
                    photoCount={(photos ?? []).filter((p) => p.design_survey_id === s.id).length}
                    usedByBrief={briefSourceSurveyIds.has(s.id)}
                    pending={removeSurvey.isPending}
                    onConfirm={() => void remove(s.id)}
                    onCancel={() => setRemoving(null)}
                  />
                )}

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
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Xác nhận gỡ, hỏi NGAY TRÊN dòng đó.
 *
 * Không dùng `window.confirm`: nút của nó là "OK"/"Cancel" tiếng Anh, không ép được sang
 * tiếng Việt (CLAUDE.md 4.1). Và khác nút gỡ một ảnh, gỡ biên bản kéo theo cả số đo lẫn ảnh
 * đính kèm nên phải hỏi, chứ không ẩn ngay khi bấm.
 */
function ConfirmRemove({
  photoCount,
  usedByBrief,
  pending,
  onConfirm,
  onCancel,
}: {
  photoCount: number;
  usedByBrief: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 rounded-sm border border-border bg-surface-sunken p-3">
      <p className="font-medium">Gỡ biên bản khảo sát này?</p>
      <p className="mt-0.5 text-fg-subtle">
        Biên bản thôi hiện trên hồ sơ nhưng vẫn còn trong cơ sở dữ liệu, khôi phục được.
        {photoCount > 0 ? ` ${formatNumber(photoCount)} ảnh hiện trạng đính kèm sẽ ẩn theo.` : ''}
      </p>
      {usedByBrief && (
        <p className="mt-1 text-status-pending">
          Đầu bài đang ghi số đo lấy từ biên bản này. Gỡ xong, màn hình Đầu bài không còn chỗ nào
          nhắc số đo đến từ đâu.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={onConfirm} disabled={pending}>
          Gỡ biên bản
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Không gỡ
        </Button>
      </div>
    </div>
  );
}

/**
 * Biểu mẫu dùng chung cho ghi mới và sửa.
 *
 * Diện tích tính từ chiều rộng × chiều sâu, không bắt nhập tay: hai người nhập ba con số
 * rời nhau thì sớm muộn có biên bản mà diện tích không khớp kích thước.
 */
function SurveyForm({
  title,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: SurveyFormValues;
  pending: boolean;
  onSubmit: (values: SurveyFormValues, computedArea: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SurveyFormValues>(initial);

  const computedArea =
    form.landWidth && form.landDepth ? String(Number(form.landWidth) * Number(form.landDepth)) : '';

  const set = (field: keyof SurveyFormValues) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSubmit(form, computedArea);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <p className="mb-4 font-medium">{title}</p>
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
        <Button type="submit" variant="primary" disabled={pending}>
          {BUTTONS.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {BUTTONS.cancel}
        </Button>
      </div>
    </form>
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

/**
 * Xuất một biên bản khảo sát ra bản in (người dùng chọn "Lưu dưới dạng PDF" ở hộp thoại in).
 *
 * Dùng lại đúng cơ chế của báo cáo BC-06 — cửa sổ in riêng + `window.print()` — chứ KHÔNG
 * nhúng thư viện dựng PDF: font mặc định của chúng thiếu glyph tiếng Việt có dấu, và đó là
 * loại lỗi chỉ lộ ra ở tệp đã xuất chứ không lộ ra lúc đọc mã nguồn (CLAUDE.md 4.1).
 *
 * Ảnh hiện trạng đi kèm bằng đường ký tạm của Supabase Storage. Đây là lý do
 * `openPrintReport` phải chờ ảnh tải xong mới in — nếu không, bản in ra toàn khung trống mà
 * không có gì báo, và ảnh chính là thứ người mang biên bản ra công trường cần nhất.
 *
 * Ảnh chưa ký được đường dẫn thì bỏ qua và NÓI RA số lượng, chứ không im lặng in thiếu.
 */
function printSurvey(
  survey: DesignSurveyRecord,
  photos: SurveyPhotoRecord[],
  projectName: string | undefined,
): void {
  const when = formatDateTime(survey.surveyed_at ?? survey.created_at);
  const size =
    survey.land_width && survey.land_depth
      ? `${formatNumber(Number(survey.land_width))} × ${formatNumber(Number(survey.land_depth))} m`
      : EM_DASH;
  const area = survey.land_area ? `${formatNumber(Number(survey.land_area))} m²` : EM_DASH;

  const facts: [string, string][] = [
    ['Dự án', projectName ?? EM_DASH],
    ['Thời điểm khảo sát', when],
    ['Người khảo sát', survey.surveyor?.full_name ?? EM_DASH],
    ['Kích thước', size],
    ['Diện tích', area],
    ['Hướng nhà', survey.orientation ?? EM_DASH],
  ];

  const blocks: [string, string | null][] = [
    ['Số liệu đo đạc', survey.measurement_notes],
    ['Hiện trạng xung quanh', survey.surrounding_notes],
    ['Ghi chú nhu cầu sử dụng', survey.usage_notes],
    ['Ghi chú khác', survey.notes],
  ];

  const withUrl = photos.filter((p) => p.url);
  const missing = photos.length - withUrl.length;

  const body = [
    `<dl>${facts
      .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join('')}</dl>`,
    ...blocks
      .filter(([, v]) => Boolean(v))
      .map(
        ([k, v]) =>
          `<div class="block"><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v!)}</p></div>`,
      ),
    photos.length === 0
      ? '<h2>Ảnh hiện trạng</h2><p class="muted">Biên bản này chưa có ảnh hiện trạng.</p>'
      : [
          `<h2>Ảnh hiện trạng (${photos.length})</h2>`,
          missing > 0
            ? `<p class="muted">${missing} tệp chưa tải được để in — mở lại trang rồi xuất lần nữa.</p>`
            : '',
          `<div class="photos">${withUrl
            .map(
              (p) =>
                `<figure><img src="${escapeHtml(p.url!)}" alt="" /><figcaption>${escapeHtml(
                  p.caption ?? p.file_name ?? '',
                )}</figcaption></figure>`,
            )
            .join('')}</div>`,
        ].join(''),
  ].join('');

  openPrintReport(`Biên bản khảo sát hiện trạng — ${when}`, body);
}
