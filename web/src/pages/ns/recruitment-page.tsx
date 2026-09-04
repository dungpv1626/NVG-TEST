/**
 * Tuyển dụng (NS-02) — mẫu bố cục Kanban (Webapp Flow 4.5, bản đồ màn hình Mục 7).
 *
 * Kanban ở đây là các bước xử lý ỨNG VIÊN của một vị trí: sàng lọc CV → phỏng vấn → tổng hợp
 * đánh giá → thư mời → nhận việc. Bản thân YÊU CẦU tuyển dụng thì không phải Kanban — nó đi
 * qua Hộp thư Phê duyệt như mọi hồ sơ cần duyệt khác (Webapp Flow 4.6).
 *
 * ⚠️ Phần mềm KHÔNG chấm điểm, KHÔNG xếp hạng và KHÔNG gợi ý chọn ai (PRD NS ranh giới).
 * Kéo thẻ là thao tác của NGƯỜI phỏng vấn; hệ thống chỉ ghi lại họ đã quyết định gì.
 */

import { useState } from 'react';
import {
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_META,
  OPEN_CANDIDATE_STAGES,
  RECRUITMENT_POSITION_STATUS_META,
  WORK_BLOCKS,
  WORK_BLOCK_LABELS,
  formatDate,
} from '@nvg/shared';
import type { CandidateStage, WorkBlock } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { KanbanBoard, type KanbanCard } from '@/components/entity/kanban-board';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import {
  useCandidates,
  useCreateCandidate,
  useCreateRecruitmentPosition,
  useHireCandidate,
  useMoveCandidate,
  useRecruitmentPositions,
  useSubmitRecruitmentApproval,
} from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { NsNav } from './ns-nav';

export function RecruitmentPage() {
  const scope = useCompanyScope();
  const canEdit = useCan('NS', 'edit');

  const { data: positions, isLoading, error, refetch } = useRecruitmentPositions();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: candidates, isLoading: loadingCandidates } = useCandidates(selected ?? undefined);

  const createPosition = useCreateRecruitmentPosition();
  const submitApproval = useSubmitRecruitmentApproval();
  const createCandidate = useCreateCandidate();
  const move = useMoveCandidate();
  const hire = useHireCandidate();

  const [title, setTitle] = useState('');
  const [block, setBlock] = useState<WorkBlock>('van_phong');
  const [headcount, setHeadcount] = useState('1');
  const [requirements, setRequirements] = useState('');

  const [candidateName, setCandidateName] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [hireDate, setHireDate] = useState('');

  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activePosition = (positions ?? []).find((p) => p.id === selected) ?? null;

  async function addPosition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    setNotice(null);
    if (!scope.companyId || scope.isAggregate) {
      setPageError(
        'Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi lập yêu cầu tuyển dụng.',
      );
      return;
    }
    try {
      const id = await createPosition.mutateAsync({
        companyId: scope.companyId,
        title,
        block,
        headcount: Number(headcount) || 1,
        requirements,
      });
      await submitApproval.mutateAsync({ positionId: id });
      setTitle('');
      setRequirements('');
      setNotice('Đã gửi yêu cầu tuyển dụng đi phê duyệt.');
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  async function addCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    if (!selected || !scope.companyId) return;
    try {
      await createCandidate.mutateAsync({
        companyId: scope.companyId,
        positionId: selected,
        fullName: candidateName,
        phone: candidatePhone || null,
      });
      setCandidateName('');
      setCandidatePhone('');
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  const cards: KanbanCard[] = (candidates ?? []).map((c) => ({
    id: c.id,
    columnId: c.stage,
    title: c.full_name,
    code: c.phone ?? '—',
    responsiblePerson: null,
    deadline: c.interview_at ?? null,
    amount: null,
    detailPath: '/ns/tuyen-dung',
    subtitle: c.employee_id ? 'Đã có hồ sơ nhân sự' : null,
  }));

  return (
    <>
      <NsNav />
      <PageHeader
        title="Tuyển dụng"
        description="Yêu cầu tuyển được duyệt trước, ứng viên đi qua từng bước, người phỏng vấn quyết định."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Tuyển dụng' }]}
      />

      {pageError && <ErrorState message={pageError} />}
      {notice && <p className="mb-4 rounded border border-border bg-bg-subtle p-3">{notice}</p>}

      {canEdit && (
        <form
          onSubmit={addPosition}
          className="mb-6 grid gap-4 rounded border border-border bg-bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Vị trí cần tuyển" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Khối làm việc">
            <select
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={block}
              onChange={(e) => setBlock(e.target.value as WorkBlock)}
            >
              {WORK_BLOCKS.map((b) => (
                <option key={b} value={b}>
                  {WORK_BLOCK_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số lượng" required>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              required
            />
          </Field>
          <Field label="Yêu cầu chuyên môn" required className="sm:col-span-2">
            <Input
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={createPosition.isPending || submitApproval.isPending}>
              Gửi phê duyệt
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (positions ?? []).length === 0 ? (
        <EmptyState message="Chưa có yêu cầu tuyển dụng nào. Lập yêu cầu để bắt đầu quy trình tuyển." />
      ) : (
        <ul className="mb-6 space-y-2">
          {(positions ?? []).map((p) => {
            const meta = RECRUITMENT_POSITION_STATUS_META[p.status];
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
              >
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-fg-subtle">
                    {WORK_BLOCK_LABELS[p.block]} · cần {p.headcount} người, đã tuyển {p.hired_count}
                    {p.needed_by_date ? ` · cần trước ${formatDate(p.needed_by_date)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusWithLabel status={meta.group} label={meta.label} />
                  {p.status === 'dang_tuyen' && (
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(selected === p.id ? null : p.id)}
                    >
                      {selected === p.id ? 'Đóng bảng ứng viên' : 'Ứng viên'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {activePosition && (
        <section>
          <h2 className="mb-2 font-semibold">Ứng viên — {activePosition.title}</h2>

          {canEdit && (
            <form onSubmit={addCandidate} className="mb-4 flex flex-wrap items-end gap-3">
              <Field label="Họ tên ứng viên" required className="w-64">
                <Input
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Điện thoại" className="w-48">
                <Input
                  value={candidatePhone}
                  onChange={(e) => setCandidatePhone(e.target.value)}
                  inputMode="tel"
                />
              </Field>
              <Button type="submit" disabled={createCandidate.isPending}>
                Thêm ứng viên
              </Button>
            </form>
          )}

          <KanbanBoard
            columns={CANDIDATE_STAGES.map((s) => ({
              id: s,
              label: CANDIDATE_STAGE_META[s].label,
              isTerminal: !OPEN_CANDIDATE_STAGES.includes(s),
            }))}
            cards={cards}
            isLoading={loadingCandidates}
            canMove={canEdit}
            emptyMessage="Chưa có ứng viên nào cho vị trí này. Thêm hồ sơ để bắt đầu sàng lọc."
            onMove={async (card, toColumnId) => {
              setPageError(null);
              try {
                await move.mutateAsync({
                  candidateId: card.id,
                  stage: toColumnId as CandidateStage,
                });
              } catch (e) {
                setPageError(toUserMessage(e, 'edit'));
                return false;
              }
            }}
          />

          {canEdit && (
            <div className="mt-4 rounded border border-border bg-bg-subtle p-4">
              <h3 className="font-semibold">Nhận việc</h3>
              <p className="mt-1 text-fg-subtle">
                Ứng viên đã gửi thư mời chuyển thành hồ sơ nhân sự, kèm checklist tiếp nhận. Tên và
                liên hệ chuyển sang, không nhập lại.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Ngày vào làm" required className="w-56">
                  <DateInput value={hireDate} onChange={setHireDate} />
                </Field>
                {(candidates ?? [])
                  .filter((c) => c.stage === 'moi_nhan_viec')
                  .map((c) => (
                    <Button
                      key={c.id}
                      variant="secondary"
                      onClick={() => {
                        setPageError(null);
                        if (!hireDate) {
                          setPageError('Chưa chọn ngày vào làm.');
                          return;
                        }
                        void hire
                          .mutateAsync({ candidateId: c.id, hireDate })
                          .then(() => setNotice(`Đã lập hồ sơ nhân sự cho ${c.full_name}.`))
                          .catch((e) => setPageError(toUserMessage(e, 'edit')));
                      }}
                    >
                      {c.full_name} nhận việc
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
