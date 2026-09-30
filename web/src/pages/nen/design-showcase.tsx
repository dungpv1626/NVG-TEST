/**
 * Trang trưng bày thành phần giao diện — đóng mục 4 của Definition of Done Phase 1.
 *
 * Vì sao cần: mỗi primitive có 3–4 trạng thái (rỗng / đang tải / lỗi / đủ dữ liệu), mà ở màn hình
 * nghiệp vụ thật thì phần lớn thời gian chỉ gặp đúng một. Trạng thái lỗi của bảng chỉ hiện khi
 * mạng hỏng; trạng thái rỗng chỉ hiện với hồ sơ đầu tiên. Không có chỗ xem tất cả cùng lúc thì
 * chúng lệch nhau dần mà không ai phát hiện.
 *
 * Đây cũng là mặt bằng để soát mỗi đợt sửa giao diện: đổi một token màu thì mở trang này là thấy
 * ngay mọi chỗ bị ảnh hưởng, thay vì phải đi qua 20 màn hình nghiệp vụ.
 *
 * Chỉ Quản trị hệ thống thấy — công cụ nội bộ của đội triển khai, không phải màn hình nghiệp vụ.
 */

import { useState, type ReactNode } from 'react';
import { STATUS_GROUPS, STATUS_META, type StatusGroup } from '@nvg/shared';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';

const SAMPLE_ROWS: EntityRow[] = [
  {
    id: '1',
    code: 'NVC-HD-2026-0001',
    title: 'Hợp đồng thi công nhà xưởng Long An',
    responsiblePerson: 'Lê Văn C',
    status: 'in_progress',
    deadline: '2027-03-30',
  },
  {
    id: '2',
    code: 'NVO-TK-2026-0014',
    title: 'Thiết kế nhà phố 3 tầng Quận 7',
    responsiblePerson: null,
    status: 'pending_approval',
    deadline: '2026-09-05',
  },
  {
    id: '3',
    code: 'NVS-DA-2026-0007',
    title: 'Cung cấp giàn giáo công trình Bình Dương',
    responsiblePerson: 'Đặng Văn G',
    status: 'overdue',
    deadline: '2026-08-01',
  },
];

/**
 * Tên lớp ĐẦY ĐỦ cho từng nhóm trạng thái.
 *
 * Không ghép chuỗi kiểu `bg-status-${x}`: Tailwind quét mã nguồn bằng văn bản lúc dựng, tên lớp
 * ghép động không có trong mã nên không được sinh ra — trên máy phát triển vẫn thấy màu (nhờ lớp
 * đã sinh cho chỗ khác), lên bản dựng thật thì mất màu.
 */
const STATUS_DOT: Readonly<Record<StatusGroup, string>> = {
  draft: 'bg-status-draft',
  pending_approval: 'bg-status-pending',
  in_progress: 'bg-status-progress',
  completed: 'bg-status-completed',
  overdue: 'bg-status-overdue',
  disputed: 'bg-status-disputed',
};

export function DesignShowcasePage() {
  // Ô tiền phải điều khiển được thì mới trưng ra hành vi tự chèn dấu chấm khi gõ.
  const [showcaseAmount, setShowcaseAmount] = useState('4500000000');

  return (
    <>
      <PageHeader
        title="Thành phần giao diện"
        description="Mọi primitive ở mọi trạng thái — dùng để soát sau mỗi đợt sửa giao diện."
        breadcrumbs={[{ label: 'Nền tảng' }, { label: 'Thành phần giao diện' }]}
      />

      <Section
        title="Nhãn trạng thái"
        note="Sáu nhóm chuẩn, không có nhóm thứ bảy. Luôn kèm chữ — không bao giờ chỉ có màu, vì khoảng 8% nam giới không phân biệt được đỏ với lục."
      >
        <div className="flex flex-wrap gap-2">
          {STATUS_GROUPS.map((s) => (
            <StatusLozenge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section
        title="Nút"
        note="Chỉ MỘT hành động chính mỗi màn hình. Nút nguy hiểm luôn kèm hộp thoại xác nhận."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Gửi phê duyệt</Button>
          <Button variant="secondary">Lưu nháp</Button>
          <Button variant="subtle">Hủy</Button>
          <Button variant="danger">Xóa hồ sơ</Button>
          <Button variant="link">Xem hướng dẫn</Button>
          <Button variant="primary" disabled>
            Không dùng được
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm">Cỡ nhỏ</Button>
          <Button size="md">Cỡ vừa</Button>
          <Button size="lg">Cỡ lớn</Button>
        </div>
      </Section>

      <Section
        title="Trường biểu mẫu"
        note="Nhãn bọc ngoài ô nhập để trình đọc màn hình tự liên kết, không phụ thuộc cặp id/htmlFor."
      >
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="Tên gói thầu" required>
            <Input placeholder="Ví dụ: Nhà xưởng Long An giai đoạn 2" />
          </Field>
          <Field label="Giá trị ước tính" hint="Đơn vị đồng. Dấu chấm phân cách tự chèn khi gõ.">
            <MoneyInput value={showcaseAmount} onChange={setShowcaseAmount} />
          </Field>
          <Field label="Mã hồ sơ">
            <Input defaultValue="NVC-DA-2026-0031" disabled />
          </Field>
          <Field
            label="Ngày nộp thầu"
            required
            hint="Thiếu ngày này thì hệ thống không nhắc hạn được."
          >
            <DateInput aria-invalid />
          </Field>
        </div>
      </Section>

      <Section
        title="Danh sách — có dữ liệu"
        note="Ba cột cố định luôn ở vị trí quen thuộc: người chịu trách nhiệm, trạng thái, thời hạn."
      >
        <EntityTable
          rows={SAMPLE_ROWS}
          isLoading={false}
          detailPath={() => '/nen/giao-dien'}
          emptyMessage="Chưa có hồ sơ nào."
          columns={[{ key: 'nhom', header: 'Phân hệ', render: (r) => r.code.split('-')[1] }]}
        />
      </Section>

      <Section
        title="Danh sách — đang tải"
        note="Khung xám ĐÚNG hình dạng nội dung sắp hiện. Không dùng vòng xoay toàn màn hình: nó che mất bố cục nên người dùng không đoán được sắp thấy gì."
      >
        <TableSkeleton rows={3} columns={5} />
      </Section>

      <Section
        title="Trạng thái rỗng"
        note="Tình trạng + gợi ý bước tiếp theo. Không để trang trắng."
      >
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            message="Chưa có gói thầu nào. Gói thầu được lập từ một cơ hội đã qua bước Khảo sát."
            action={<Button variant="secondary">Tạo gói thầu</Button>}
          />
        </div>
      </Section>

      <Section
        title="Trạng thái lỗi"
        note="Nói bằng ngôn ngữ nghiệp vụ và nêu việc cần làm. Chi tiết kỹ thuật chỉ ghi log, không đưa ra màn hình."
      >
        <div className="rounded-lg border border-border bg-surface">
          <ErrorState
            message="Không tải được danh sách. Kiểm tra kết nối mạng rồi thử lại."
            onRetry={() => {}}
          />
        </div>
      </Section>

      <Section
        title="Thang chữ"
        note="Bảy cỡ khai tường minh. Nội dung chính giữ 14px — mật độ thông tin là yêu cầu nghiệp vụ, không phải thứ đem đánh đổi cho thoáng đẹp."
      >
        <div className="space-y-1">
          <p className="text-3xl font-semibold">30px — số liệu nổi bật</p>
          <p className="text-2xl font-semibold">24px — số liệu Dashboard</p>
          <p className="text-xl font-semibold">20px — tiêu đề trang</p>
          <p className="text-lg font-semibold">18px — tiêu đề mục</p>
          <p className="text-md font-semibold">16px — tiêu đề thẻ</p>
          <p>14px — nội dung chính, bảng, biểu mẫu</p>
          <p className="text-xs text-fg-subtle">12px — nhãn phụ, chú thích</p>
        </div>
        <p className="mt-3 tabular-nums">
          Số liệu căn thẳng cột: 125.000.000 · 99.000.000 · 4.500.000.000
        </p>
      </Section>

      <Section
        title="Màu"
        note="Rừng/bạc hà là thương hiệu — dùng cho hành động chính, liên kết, logo, nav active. Nhãn trạng thái là một hệ màu ĐÓNG, độc lập với thương hiệu (không dùng brand/mint/forest) — xem design-rules.test.ts."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Swatch name="Hành động chính" className="bg-brand" />
          <Swatch name="Rừng — logo/nav active" className="bg-brand-forest" />
          <Swatch name="Bạc hà — pill nhấn" className="bg-brand-mint" />
          <Swatch name="Nền trang" className="border border-border bg-surface-sunken" />
          <Swatch name="Viền" className="bg-border-strong" />
          <Swatch name="Chữ chính" className="bg-fg" />
          <Swatch name="Chữ phụ" className="bg-fg-subtle" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Swatch name="Biểu đồ 1 — chuỗi chính" className="bg-chart-1" />
          <Swatch name="Biểu đồ 2 — đi cặp" className="bg-chart-2" />
          <Swatch name="Biểu đồ 3 — đường" className="bg-chart-3" />
          <Swatch name="Biểu đồ 4 — chi, so sánh" className="bg-chart-4" />
          <Swatch name="Biểu đồ 5 — nền" className="bg-chart-5" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {STATUS_GROUPS.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <span aria-hidden className={`size-3 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 mt-0.5 max-w-3xl text-xs text-fg-subtle">{note}</p>
      {children}
    </section>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <span className="flex items-center gap-2 text-xs">
      <span aria-hidden className={`size-8 rounded-md ${className}`} />
      {name}
    </span>
  );
}
