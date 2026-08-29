/**
 * Chú giải một hồ sơ cũ — Bước 3 của pipeline số hoá (06-knowledge-base 6.1).
 *
 * Nguyên tắc của màn hình này: **10–15 phút mỗi công trình, không bắt viết luận.** Mặt bằng
 * đã trích nằm ngay cạnh câu hỏi để không phải mở AutoCAD ở cửa sổ khác; câu trả lời là lựa
 * chọn có sẵn; ô chữ tự do chỉ mở khi chọn "Khác".
 *
 * Không phải mẫu bố cục thứ tám: đây là mẫu Biểu mẫu (Webapp Flow 4.4) một trang, dưới mười
 * trường, có xem trước hình học ở cột bên.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ANNOTATION_OTHER,
  ANNOTATION_QUESTIONS,
  OUTCOME_QUESTION,
  type AnnotationOutcome,
  type AnnotationRationale,
} from '@nvg/shared/design';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { useAnnotateKbRecord, useKbRecord } from '@/hooks/use-kb-records';
import { toUserMessage } from '@/hooks/use-error-message';
import { KbFloorPlan } from './kb-floor-plan';
import { TkNav } from './tk-nav';

type Field = (typeof ANNOTATION_QUESTIONS)[number]['field'];

/** Câu trả lời đang soạn: mã lựa chọn + ô chữ tự do khi chọn "Khác". */
type Draft = Record<Field, { choice: string; other: string }>;

const EMPTY_DRAFT: Draft = {
  stair_position: { choice: '', other: '' },
  kitchen_position: { choice: '', other: '' },
  biggest_constraint: { choice: '', other: '' },
  would_change: { choice: '', other: '' },
};

/** Giá trị đã lưu → dạng đang soạn. Giá trị không khớp mã nào là chữ tự do đã nhập lần trước. */
function toDraft(rationale: AnnotationRationale | null | undefined): Draft {
  const draft = structuredClone(EMPTY_DRAFT);
  for (const question of ANNOTATION_QUESTIONS) {
    const saved = rationale?.[question.field];
    if (!saved) continue;
    if (question.options.some((o) => o.value === saved)) draft[question.field].choice = saved;
    else draft[question.field] = { choice: ANNOTATION_OTHER, other: saved };
  }
  return draft;
}

export function KbAnnotatePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useKbRecord(id);
  const annotate = useAnnotateKbRecord(id ?? '');

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [satisfied, setSatisfied] = useState<'' | 'co' | 'khong'>('');
  const [issues, setIssues] = useState('');
  const [level, setLevel] = useState(0);

  // Nạp giá trị đã lưu khi bản ghi về. Sửa dở rồi tải lại thì không mất chữ đang nhập vì
  // hiệu ứng này chỉ chạy khi bản ghi đổi (Webapp Flow 6.3).
  useEffect(() => {
    if (!data) return;
    setDraft(toDraft(data.payload.rationale));
    const value = data.payload.outcome?.client_satisfied;
    setSatisfied(value === true ? 'co' : value === false ? 'khong' : '');
    setIssues((data.payload.outcome?.construction_issues ?? []).join('\n'));
  }, [data]);

  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;
  if (!data)
    return <RecordNotFound entity="hồ sơ cũ" listPath="/tk/ho-so-cu" listLabel="Kho hồ sơ cũ" />;

  const plans = data.payload.floor_plans ?? [];
  const current = plans[Math.min(level, plans.length - 1)];

  function save() {
    const rationale: AnnotationRationale = {};
    for (const question of ANNOTATION_QUESTIONS) {
      const answer = draft[question.field];
      const value = answer.choice === ANNOTATION_OTHER ? answer.other.trim() : answer.choice;
      rationale[question.field] = value || null;
    }
    const outcome: AnnotationOutcome = {
      client_satisfied: satisfied === '' ? null : satisfied === 'co',
      construction_issues: issues
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };
    annotate.mutate({ rationale, outcome });
  }

  return (
    <>
      <TkNav />
      <PageHeader
        title={data.project_code}
        breadcrumbs={[
          { label: 'Thiết kế' },
          { label: 'Hồ sơ cũ đã số hoá', to: '/tk/ho-so-cu' },
          { label: data.project_code },
        ]}
        description={`Chất lượng trích ${Math.round((data.quality_score ?? 0) * 100)}% · ${plans.length} tầng · lô ${data.site_width_m ?? '—'} × ${data.site_depth_m ?? '—'} m`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Mặt bằng đã trích">
          {plans.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {plans.map((p, i) => (
                <button
                  key={p.level}
                  type="button"
                  onClick={() => setLevel(i)}
                  aria-pressed={i === level}
                  className={`min-h-10 rounded border px-3 ${
                    i === level
                      ? 'border-brand bg-brand-subtle font-semibold text-brand'
                      : 'border-border text-fg-subtle'
                  }`}
                >
                  Tầng {p.level}
                </button>
              ))}
            </div>
          ) : null}

          {current ? (
            <KbFloorPlan plan={current} />
          ) : (
            <p className="rounded border border-border bg-surface-sunken p-4 text-fg-subtle">
              Bản ghi chưa có mặt bằng nào trích được.
            </p>
          )}

          {data.payload.extraction_warnings?.length ? (
            <div className="mt-3 rounded border border-border bg-surface-sunken p-3">
              <p className="font-semibold">Chỗ trích xuất chưa chắc chắn</p>
              <ul className="mt-1 list-disc pl-5 text-fg-subtle">
                {data.payload.extraction_warnings.map((w, i) => (
                  <li key={i}>{w.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-label="Câu hỏi chú giải" className="space-y-5">
          {ANNOTATION_QUESTIONS.map((question) => (
            <fieldset key={question.field}>
              <legend className="mb-2 font-semibold">{question.question}</legend>
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={draft[question.field].choice === option.value}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        [question.field]: { ...prev[question.field], choice: option.value },
                      }))
                    }
                    // Vùng bấm tối thiểu 40px chiều cao trên di động (Content Guidelines 6.8).
                    className={`min-h-10 rounded-full border px-3 ${
                      draft[question.field].choice === option.value
                        ? 'border-brand bg-brand-subtle font-semibold text-brand'
                        : 'border-border text-fg-subtle'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {draft[question.field].choice === ANNOTATION_OTHER ? (
                <Input
                  className="mt-2"
                  aria-label={`${question.question} — nội dung khác`}
                  placeholder="Ghi ngắn gọn lý do"
                  value={draft[question.field].other}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [question.field]: { ...prev[question.field], other: e.target.value },
                    }))
                  }
                />
              ) : null}
            </fieldset>
          ))}

          <fieldset>
            <legend className="mb-2 font-semibold">{OUTCOME_QUESTION.satisfaction}</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'co', label: 'Hài lòng' },
                { value: 'khong', label: 'Chưa hài lòng' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={satisfied === option.value}
                  onClick={() =>
                    setSatisfied((prev) =>
                      prev === option.value ? '' : (option.value as 'co' | 'khong'),
                    )
                  }
                  className={`min-h-10 rounded-full border px-3 ${
                    satisfied === option.value
                      ? 'border-brand bg-brand-subtle font-semibold text-brand'
                      : 'border-border text-fg-subtle'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="mb-2 block font-semibold" htmlFor="kb-issues">
              {OUTCOME_QUESTION.issues}
            </label>
            <textarea
              id="kb-issues"
              rows={3}
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder="Mỗi dòng một phát sinh"
              className="w-full rounded border border-border bg-surface p-2"
            />
          </div>

          {/* Nói thẳng cái gì rời khỏi hệ thống. Người nhập cần biết trước khi gõ, không phải
              sau khi bấm lưu (Content Guidelines 2 — hỗ trợ chứ không phán xét). */}
          <p className="rounded border border-border bg-surface-sunken p-3 text-fg-subtle">
            Phần chữ tự do chỉ lưu trong hệ thống. Chỉ các lựa chọn có sẵn và thuộc tính không định
            danh (loại hình, số tầng, danh sách loại phòng) được dùng để tìm hồ sơ tương tự.
          </p>

          {annotate.isError ? (
            <p className="text-status-overdue">{toUserMessage(annotate.error)}</p>
          ) : null}
          {annotate.isSuccess ? (
            <p className="text-status-completed">
              Đã lưu chú giải.
              {annotate.data?.embedded === false
                ? ' Chưa tính được vector tìm kiếm — lưu lại lần nữa để tính lại.'
                : ''}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={save} disabled={annotate.isPending}>
              {annotate.isPending ? 'Đang lưu…' : 'Lưu chú giải'}
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/tk/ho-so-cu">Về kho hồ sơ cũ</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
