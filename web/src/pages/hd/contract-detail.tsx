/**
 * Chi tiết Hợp đồng — "Hồ sơ 360°" (Webapp Flow 4.3).
 *
 * Đây là màn hình chứng minh tiêu chí nghiệm thu Giai đoạn 1 (PRD Mục 7): từ một hợp đồng
 * phải truy ngược được về đúng cơ hội gốc, đúng phiên bản dự toán đã duyệt, ai duyệt và khi
 * nào. Panel ngữ cảnh bên phải chính là đường đi đó, và nó KHÔNG chép dữ liệu — chỉ liên kết.
 *
 * Nút hành động chính đổi theo bước, mỗi lúc chỉ MỘT nút chính (Content Guidelines 6.3):
 * Nháp → Trình ký · Đã duyệt → Ghi nhận đã ký · Đã ký → Quyết toán.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CONTRACT_SOURCE_LABELS,
  CONTRACT_SOURCE_ROUTES,
  CONTRACT_STAGE_META,
  CONTRACT_TYPE_LABELS,
  SITE_STAGE_META,
  contractDisplayStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
  summarizeContractValue,
} from '@nvg/shared';
import { DetailFields, EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useCloseContract,
  useContract,
  useContractAmendments,
  useSignContract,
  useSubmitContractApproval,
  useUpdateContract,
} from '@/hooks/use-contracts';
import {
  useOpenSiteFromContract,
  useSitesOfContract,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { AmendmentPanel } from './amendment-panel';
import { TermsPanel } from './terms-panel';

const EM_DASH = '—';

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('HD', 'edit');

  const { data, isLoading, error } = useContract(id);
  const { data: amendments } = useContractAmendments(id);
  const { data: sites } = useSitesOfContract(id);
  const openSite = useOpenSiteFromContract();
  const updateContract = useUpdateContract();
  const submitApproval = useSubmitContractApproval();
  const signContract = useSignContract();
  const closeContract = useCloseContract();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <EmptyState message="Không tìm thấy hợp đồng này. Có thể hồ sơ đã được xóa hoặc vai trò hiện tại chưa được cấp quyền xem." />
    );
  }

  const contract = data;
  const isDraft = contract.stage === 'nhap';
  const isClosed = contract.stage === 'hoan_thanh' || contract.stage === 'huy';
  const readOnly = !canEdit || isClosed;

  /**
   * Mở công trình sau khi ký (TC-01).
   *
   * KHÔNG áp dụng cho hợp đồng khoán tổ đội: đó là hợp đồng NVG đi THUÊ, nằm bên trong một
   * công trình đã có chứ không sinh ra công trình mới — CSDL cũng từ chối nếu vẫn gọi.
   */
  const canOpenSite =
    contract.stage === 'da_ky' && contract.type !== 'khoan_thau_phu' && (sites ?? []).length === 0;

  // Chỉ cộng phát sinh ĐÃ PHÊ DUYỆT vào giá trị hiện hành: phát sinh đang đề xuất chưa phải
  // là cam kết, cộng sớm thì báo cáo doanh thu chạy trước thực tế (HD-03).
  const approvedAmendments = (amendments ?? [])
    .filter((a) => a.stage === 'da_duyet' || a.stage === 'da_thuc_hien')
    .reduce((sum, a) => sum + BigInt(String(a.value_change ?? 0).split('.')[0] || '0'), 0n);

  const money = summarizeContractValue(
    contract.value,
    approvedAmendments,
    contract.collected_amount,
  );

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function sign() {
    const number = window.prompt('Số hợp đồng theo văn bản đã ký:');
    if (number === null) return;
    const signedDate = window.prompt('Ngày ký (dạng yyyy-mm-dd):', new Date().toISOString().slice(0, 10));
    if (signedDate === null) return;
    void run(() =>
      signContract.mutateAsync({
        contractId: contract.id,
        contractNumber: number.trim(),
        signedDate: signedDate.trim(),
      }),
    );
  }

  function cancel() {
    const reason = window.prompt('Nguyên nhân hủy hợp đồng:');
    if (reason === null) return;
    void run(() =>
      closeContract.mutateAsync({ contractId: contract.id, stage: 'huy', reason: reason.trim() }),
    );
  }

  const actions = readOnly ? undefined : (
    <>
      {isDraft && (
        <Button
          variant="primary"
          disabled={submitApproval.isPending}
          onClick={() => void run(() => submitApproval.mutateAsync({ contractId: contract.id }))}
        >
          Gửi phê duyệt
        </Button>
      )}
      {contract.stage === 'da_duyet' && (
        <Button variant="primary" onClick={sign}>
          Ghi nhận đã ký
        </Button>
      )}
      {canOpenSite && (
        <Button
          variant="primary"
          disabled={openSite.isPending}
          onClick={() => void run(() => openSite.mutateAsync({ contractId: contract.id }))}
        >
          Mở công trình
        </Button>
      )}
      {contract.stage === 'da_ky' && (
        // Chỉ MỘT nút chính mỗi màn hình (Content Guidelines 6.3): còn phải mở công trình
        // thì đó mới là việc tiếp theo, quyết toán lùi xuống nút phụ.
        <Button
          variant={canOpenSite ? 'secondary' : 'primary'}
          onClick={() =>
            void run(() =>
              closeContract.mutateAsync({ contractId: contract.id, stage: 'hoan_thanh' }),
            )
          }
        >
          Quyết toán hợp đồng
        </Button>
      )}
      <Button variant="secondary" onClick={cancel}>
        Hủy hợp đồng
      </Button>
    </>
  );

  return (
    <>
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[{ label: 'Hợp đồng', to: '/hd/hop-dong' }, { label: contract.title }]}
        title={contract.title}
        code={contract.contract_number ?? contract.code}
        status={contractDisplayStatus(contract.stage, contract.end_date)}
        responsiblePerson={contract.responsible?.full_name ?? null}
        deadline={contract.end_date}
        actions={actions}
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <>
                <DetailFields
                  fields={[
                    { label: 'Trạng thái', value: CONTRACT_STAGE_META[contract.stage].label },
                    { label: 'Loại hợp đồng', value: CONTRACT_TYPE_LABELS[contract.type] },
                    { label: 'Mã hồ sơ nội bộ', value: contract.code },
                    {
                      label: 'Số hợp đồng',
                      value: contract.contract_number ?? 'Chưa ký',
                    },
                    {
                      label: 'Đối tác',
                      value: contract.customer?.name ?? contract.partner_name ?? EM_DASH,
                    },
                    {
                      label: 'Ngày ký',
                      value: contract.signed_date ? formatDate(contract.signed_date) : EM_DASH,
                    },
                    {
                      label: 'Thời gian thực hiện',
                      value:
                        contract.start_date || contract.end_date
                          ? `${contract.start_date ? formatDate(contract.start_date) : '?'} — ${
                              contract.end_date ? formatDate(contract.end_date) : '?'
                            }`
                          : EM_DASH,
                    },
                    {
                      label: 'Nguyên nhân hủy',
                      value: contract.cancel_reason ?? EM_DASH,
                    },
                  ]}
                />

                {/* HD-03: giá trị, phát sinh, đã thu, còn phải thu — bốn con số phải nằm
                    cạnh nhau, vì câu hỏi thường gặp nhất là "còn phải thu bao nhiêu". */}
                <section className="mt-4 rounded-lg border border-border bg-surface-sunken p-4">
                  <p className="mb-3 font-medium">Giá trị và công nợ</p>
                  <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-fg-subtle">Giá trị gốc</dt>
                      <dd className="mt-0.5">{formatCurrency(money.baseValue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Phát sinh đã duyệt</dt>
                      <dd className="mt-0.5">{formatCurrency(money.approvedAmendments)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Giá trị hiện hành</dt>
                      <dd className="mt-0.5 font-semibold">{formatCurrency(money.currentValue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Còn phải thu</dt>
                      <dd className="mt-0.5 font-semibold">{formatCurrency(money.outstanding)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-fg-subtle">
                    Đã thu {formatCurrency(money.collected)}. Số liệu thu tiền do Module Kế toán
                    cập nhật khi có chứng từ.
                  </p>
                </section>

                <label className="mt-4 block">
                  <span className="block font-medium">Ghi chú</span>
                  {readOnly ? (
                    <p className="mt-1 whitespace-pre-wrap">{contract.notes ?? EM_DASH}</p>
                  ) : (
                    <textarea
                      defaultValue={contract.notes ?? ''}
                      rows={3}
                      className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2"
                      onBlur={(e) =>
                        void run(() =>
                          updateContract.mutateAsync({
                            id: contract.id,
                            changes: { notes: e.target.value.trim() || null },
                          }),
                        )
                      }
                    />
                  )}
                </label>
              </>
            ),
          },
          {
            id: 'dieu-khoan',
            label: 'Điều khoản',
            content: (
              <TermsPanel
                contractId={contract.id}
                companyId={contract.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'phat-sinh',
            label: 'Phát sinh',
            badge: amendments?.length || undefined,
            content: (
              <AmendmentPanel
                contractId={contract.id}
                companyId={contract.company_id}
                readOnly={readOnly}
              />
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Tạo lúc', value: formatDateTime(contract.created_at) },
              { label: 'Cập nhật gần nhất', value: formatDateTime(contract.updated_at) },
              {
                label: 'Phê duyệt nội bộ',
                value: contract.approved_at ? formatDateTime(contract.approved_at) : EM_DASH,
              },
              {
                label: 'Ghi nhận đã ký',
                value: contract.signed_at ? formatDateTime(contract.signed_at) : EM_DASH,
              },
              {
                label: 'Quyết toán',
                value: contract.settled_at ? formatDateTime(contract.settled_at) : EM_DASH,
              },
            ]}
          />
        }
        related={[
          {
            title: 'Truy ngược hồ sơ',
            records: [
              ...(contract.source_type && contract.source_id
                ? [
                    {
                      label: CONTRACT_SOURCE_LABELS[contract.source_type],
                      value: 'Mở hồ sơ nguồn',
                      to: `${CONTRACT_SOURCE_ROUTES[contract.source_type]}/${contract.source_id}`,
                    },
                  ]
                : []),
              ...(contract.estimate
                ? [
                    {
                      label: 'Dự toán đã duyệt',
                      value: `${contract.estimate.code} — phiên bản ${contract.estimate.version}`,
                    },
                  ]
                : []),
            ],
          },
          ...((sites ?? []).length > 0
            ? [
                {
                  title: 'Thi công',
                  records: (sites ?? []).map((s) => ({
                    label: SITE_STAGE_META[s.stage].label,
                    value: `${s.code} — ${s.name}`,
                    to: `/tc/cong-trinh/${s.id}`,
                  })),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
