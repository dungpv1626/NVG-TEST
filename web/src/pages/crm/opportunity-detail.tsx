/**
 * Chi tiết Cơ hội kinh doanh — hành trình ở Webapp Flow Mục 3.1.
 *
 * Tab theo đúng các bước của hành trình Nhân viên Kinh doanh:
 * Tổng quan → Khảo sát (CRM-03) → Báo giá (CRM-04) → Lịch sử (tự thêm).
 *
 * Chuyển giai đoạn có thể làm ở đây HOẶC bằng kéo–thả trên Kanban — kéo–thả không được là
 * cách duy nhất để thực hiện một thao tác (Content Guidelines 6.8).
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  OPPORTUNITY_CLASSIFICATION_LABELS,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_META,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  type OpportunityClassification,
  type OpportunityStage,
} from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useContractForSource } from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useMoveStage,
  useOpportunity,
  useOpportunityStageHistory,
} from '@/hooks/use-opportunities';
import { useCan, useIsResponsible } from '@/lib/auth';
import { QuotePanel } from './quote-panel';
import { EMPTY_SURVEY_DRAFT, SurveyPanel, type SurveyDraft } from './survey-panel';
import { cn } from '@/lib/utils';

const EM_DASH = '—';

interface CustomerFull {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEditModule = useCan('CRM', 'edit');

  const { data, isLoading, error } = useOpportunity(id);

  const { data: contractId } = useContractForSource('opportunities', id);
  const { data: history } = useOpportunityStageHistory(id);
  const moveStage = useMoveStage();
  const isResponsible = useIsResponsible(data?.owner_id);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Bản nháp biên bản khảo sát giữ Ở ĐÂY, không giữ trong tab: `EntityDetail` chỉ dựng nội
  // dung của tab đang mở, nên chuyển sang tab Báo giá rồi quay lại sẽ mất sạch phần đang gõ
  // nếu state nằm trong chính tab đó (Webapp Flow 6.3).
  const [surveyDraft, setSurveyDraft] = useState<SurveyDraft>(EMPTY_SURVEY_DRAFT);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="cơ hội kinh doanh"
        listPath="/crm/co-hoi"
        listLabel="Quay lại danh sách cơ hội"
      />
    );
  }

  // Hai điều kiện khác nhau: vai trò được sửa hồ sơ CRM, VÀ chính người này phụ trách cơ hội.
  // Thiếu vế thứ hai là hiện nút cho người mà RLS sẽ chặn (Webapp Flow 6.5).
  const canEdit = canEditModule && isResponsible;

  const stageMeta = OPPORTUNITY_STAGE_META[data.stage];
  const customer = (data as unknown as { customer_full: CustomerFull | null }).customer_full;
  const isHandedOver = data.handed_over_at !== null;

  async function changeStage(toStage: OpportunityStage) {
    setMoveError(null);
    let lostReason: string | undefined;
    if (toStage === 'mat_co_hoi') {
      const input = window.prompt('Nguyên nhân mất cơ hội (bắt buộc):');
      if (input === null || !input.trim()) return;
      lostReason = input.trim();
    }
    try {
      await moveStage.mutateAsync({ opportunityId: data!.id, toStage, lostReason });
    } catch (e) {
      setMoveError(toUserMessage(e, 'edit'));
    }
  }

  /** Giai đoạn kế tiếp theo đúng thứ tự pipeline (CRM-02). */
  const currentIndex = OPPORTUNITY_STAGES.indexOf(data.stage);
  const nextStage =
    stageMeta.isTerminal || currentIndex < 0
      ? null
      : (OPPORTUNITY_STAGES[currentIndex + 1] ?? null);

  return (
    <>
      {moveError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {moveError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Cơ hội kinh doanh', to: '/crm/co-hoi' },
          { label: data.name },
        ]}
        title={data.name}
        code={data.code}
        status={stageMeta.statusGroup}
        responsiblePerson={data.owner?.full_name ?? null}
        deadline={data.due_date}
        actions={
          canEdit && !isHandedOver ? (
            <div className="flex items-center gap-2">
              {nextStage && nextStage !== 'mat_co_hoi' && (
                <Button
                  variant="primary"
                  disabled={moveStage.isPending}
                  onClick={() => void changeStage(nextStage)}
                >
                  Chuyển sang {OPPORTUNITY_STAGE_META[nextStage].label}
                </Button>
              )}
              {!stageMeta.isTerminal && (
                <Button
                  variant="secondary"
                  disabled={moveStage.isPending}
                  onClick={() => void changeStage('mat_co_hoi')}
                >
                  Đánh dấu mất cơ hội
                </Button>
              )}
              {/* Webapp Flow 3.1 bước 5: khách đồng ý ở bước Đàm phán thì soạn hợp đồng
                  ngay tại chỗ, lấy sẵn khách hàng và giá đã duyệt (HD-01). */}
              {(data.stage === 'dam_phan' || data.stage === 'ky_hop_dong') && (
                <DraftContractButton
                  sourceType="opportunities"
                  sourceId={data.id}
                  defaultType="thi_cong"
                  existingContractId={contractId}
                />
              )}
            </div>
          ) : isHandedOver ? (
            // CRM-06: sau khi bàn giao, cơ hội chuyển chế độ chỉ xem.
            <span className="text-fg-subtle">
              Đã bàn giao {formatDate(data.handed_over_at)} — chỉ xem
            </span>
          ) : undefined
        }
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <div className="space-y-6">
                <DetailFields
                  fields={[
                    {
                      label: 'Khách hàng',
                      value: customer ? (
                        <Link
                          to={`/crm/khach-hang/${customer.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {customer.name}
                        </Link>
                      ) : (
                        EM_DASH
                      ),
                    },
                    { label: 'Người liên hệ', value: customer?.contact_person ?? EM_DASH },
                    { label: 'Điện thoại', value: formatPhone(customer?.phone) || EM_DASH },
                    { label: 'Email', value: customer?.email ?? EM_DASH },
                    { label: 'Loại công trình', value: data.project_type ?? EM_DASH },
                    {
                      label: 'Giá trị dự kiến',
                      value: data.estimated_value ? formatCurrency(data.estimated_value) : EM_DASH,
                    },
                    {
                      label: 'Tiến độ mong muốn',
                      value: formatDate(data.expected_start_date) || EM_DASH,
                    },
                    {
                      label: 'Phân loại',
                      value: data.classification
                        ? OPPORTUNITY_CLASSIFICATION_LABELS[
                            data.classification as OpportunityClassification
                          ]
                        : EM_DASH,
                    },
                    { label: 'Ghi chú', value: data.notes ?? EM_DASH },
                    ...(data.lost_reason
                      ? [{ label: 'Nguyên nhân mất cơ hội', value: data.lost_reason }]
                      : []),
                  ]}
                />

                <div className="rounded-lg border border-border bg-surface-sunken p-3">
                  <p className="mb-1 font-medium">Giai đoạn hiện tại: {stageMeta.label}</p>
                  <p className="text-fg-subtle">{stageMeta.description}</p>
                </div>
              </div>
            ),
          },
          {
            id: 'khao-sat',
            label: 'Khảo sát',
            content: (
              <SurveyPanel
                opportunityId={data.id}
                canEdit={canEdit}
                isHandedOver={isHandedOver}
                draft={surveyDraft}
                onDraftChange={setSurveyDraft}
              />
            ),
          },
          {
            id: 'bao-gia',
            label: 'Báo giá',
            content: (
              <QuotePanel opportunityId={data.id} canEdit={canEdit} isHandedOver={isHandedOver} />
            ),
          },
        ]}
        historyContent={
          history && history.length > 0 ? (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <div
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      h.to_stage === 'mat_co_hoi' ? 'bg-status-overdue' : 'bg-brand',
                    )}
                  />
                  <div className="min-w-0">
                    {/* Hiển thị TÊN GIAI ĐOẠN cho cả hai đầu, không dùng nhãn trạng thái:
                        nhiều giai đoạn cùng quy về một nhóm trạng thái (Khảo sát và Đàm phán
                        đều là "Đang xử lý"), nên dùng nhãn trạng thái sẽ đọc thành
                        "Đang xử lý → Đang xử lý" và mất thông tin. */}
                    <div className="flex flex-wrap items-center gap-2">
                      {h.from_stage && (
                        <>
                          <span className="text-fg-subtle">
                            {OPPORTUNITY_STAGE_META[h.from_stage].label}
                          </span>
                          <span className="text-fg-subtle">→</span>
                        </>
                      )}
                      <span className="font-medium">
                        {OPPORTUNITY_STAGE_META[h.to_stage].label}
                      </span>
                      <StatusLozenge status={OPPORTUNITY_STAGE_META[h.to_stage].statusGroup} />
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {h.changed_by_user?.full_name ?? 'Hệ thống'} · {formatDateTime(h.changed_at)}
                    </div>
                    {h.note && <p className="mt-0.5">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState message="Chưa có lịch sử chuyển giai đoạn." />
          )
        }
        related={[
          {
            title: 'Hồ sơ liên quan',
            records: customer
              ? [
                  {
                    label: 'Khách hàng',
                    value: customer.name,
                    to: `/crm/khach-hang/${customer.id}`,
                  },
                ]
              : [],
          },
        ]}
      />
    </>
  );
}
