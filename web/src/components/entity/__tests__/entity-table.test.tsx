/**
 * `EntityTable` — primitive mà khoảng 20 màn hình Danh sách thừa hưởng.
 *
 * Sai ở đây là sai đồng loạt ở mọi module, nên đây là chỗ đáng canh nhất trong toàn bộ giao diện.
 * Hai nhóm quy tắc bị canh:
 *
 *  - **Bộ lọc nằm trên thanh địa chỉ** (Webapp Flow 4.2): quay lại từ màn hình Chi tiết không
 *    được mất bộ lọc, và đường dẫn phải chia sẻ được cho người khác.
 *  - **Thẻ chỉ số trên Dashboard dẫn thẳng tới danh sách đã lọc sẵn** (Webapp Flow 4.1): con số
 *    trên thẻ và con số trên danh sách phải khớp nhau. Đây chính là chỗ đã sai thật một lần —
 *    thẻ đếm theo kỳ báo cáo nhưng đường dẫn không mang theo kỳ.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityTable, listPathFiltered, useCreateActions, type EntityRow } from '../entity-table';
import { renderWithApp } from '@/test/render';

// Phạm vi pháp nhân là thứ EntityTable đọc để quyết định có hiện cột "Pháp nhân" hay không.
const scope = vi.hoisted(() => ({
  value: { companyId: 'nvc-id', companyCode: 'NVC', isAggregate: false, isReady: true },
}));
vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => scope.value,
  withCompanyScope: <Q,>(q: Q) => q,
}));
vi.mock('@/hooks/use-companies', () => ({
  useCompanyLookup: () => (id: string | null | undefined) =>
    id === 'nvc-id' ? { id, code: 'NVC', short_name: 'Nhà Việt Cons' } : null,
}));

function setScope(isAggregate: boolean) {
  scope.value = { ...scope.value, isAggregate };
}

// Đặt lại trước MỖI test. Dọn ở cuối test thì một test đỏ giữa chừng sẽ để lại phạm vi gộp cho
// test kế tiếp, và test kế tiếp đỏ theo vì lý do chẳng liên quan gì tới nó.
beforeEach(() => setScope(false));

const ROWS: EntityRow[] = [
  {
    id: '1',
    code: 'NVC-HD-2026-0001',
    title: 'Hợp đồng nhà xưởng Long An',
    responsiblePerson: 'Lê Văn C',
    status: 'in_progress',
    deadline: null,
    companyId: 'nvc-id',
    createdAt: '2026-08-20',
  },
  {
    id: '2',
    code: 'NVC-HD-2026-0002',
    title: 'Hợp đồng kho lạnh',
    responsiblePerson: 'Nguyễn Văn A',
    status: 'overdue',
    deadline: '2026-08-01',
    companyId: 'nvc-id',
    createdAt: '2026-02-10',
  },
];

function table(props: Partial<React.ComponentProps<typeof EntityTable>> = {}) {
  return (
    <EntityTable
      rows={ROWS}
      isLoading={false}
      detailPath={(row) => `/hd/hop-dong/${row.id}`}
      emptyMessage="Chưa có hợp đồng nào."
      {...props}
    />
  );
}

/**
 * Truy vấn giới hạn trong BẢNG của khổ máy tính.
 *
 * `EntityTable` dựng đồng thời hai bố cục — danh sách thẻ cho điện thoại và bảng cho máy tính —
 * rồi để CSS quyết định bố cục nào hiện (Webapp Flow 4.8: không thu nhỏ bố cục máy tính). Trên
 * trình duyệt thật, `display: none` loại hẳn bố cục kia khỏi cây trợ năng nên người dùng và trình
 * đọc màn hình chỉ gặp một bản. Nhưng jsdom không áp CSS, nên mọi nội dung có mặt hai lần ở đây.
 * Ràng buộc truy vấn vào bảng để mỗi khẳng định nói về đúng một bố cục xác định.
 */
function inTable() {
  return within(screen.getByRole('table'));
}

describe('EntityTable — bộ lọc trên thanh địa chỉ', () => {
  it('lọc sẵn theo trạng thái khi mở bằng đường dẫn từ thẻ Dashboard', () => {
    renderWithApp(table(), { route: '/hd/hop-dong?trang-thai=overdue' });

    expect(inTable().getByText('Hợp đồng kho lạnh')).toBeInTheDocument();
    expect(inTable().queryByText('Hợp đồng nhà xưởng Long An')).not.toBeInTheDocument();
  });

  it('lọc sẵn theo KỲ BÁO CÁO — nếu không, con số trên thẻ khác con số trên danh sách', () => {
    // Mốc năm 2000 luôn nằm ngoài "Tháng này" bất kể test chạy ngày nào — khẳng định được là
    // bộ lọc THẬT SỰ loại hồ sơ ngoài kỳ, chứ không phải chỉ chạy qua mà không làm gì.
    const rows: EntityRow[] = [
      { ...ROWS[0]!, createdAt: '2000-01-15', title: 'Hợp đồng rất cũ' },
      {
        ...ROWS[1]!,
        createdAt: new Date().toISOString().slice(0, 10),
        title: 'Hợp đồng tháng này',
      },
    ];
    renderWithApp(table({ rows }), { route: '/hd/hop-dong?ky=thang-nay' });

    expect(inTable().getByText('Hợp đồng tháng này')).toBeInTheDocument();
    expect(inTable().queryByText('Hợp đồng rất cũ')).not.toBeInTheDocument();
  });

  it('kỳ "Tất cả" thì không loại hồ sơ nào', () => {
    const rows: EntityRow[] = [{ ...ROWS[0]!, createdAt: '2000-01-15', title: 'Hợp đồng rất cũ' }];
    renderWithApp(table({ rows }), { route: '/hd/hop-dong?ky=tat-ca' });
    expect(inTable().getByText('Hợp đồng rất cũ')).toBeInTheDocument();
  });

  /**
   * Danh sách KHÔNG khai `createdAt` thì bộ lọc kỳ phải bỏ qua, không được loại sạch mọi dòng.
   * Nhầm `undefined` (danh sách không theo dõi ngày lập) với `null` (hồ sơ để trống ngày) là
   * cách một danh sách rỗng trắng mà không có gì trên màn hình giải thích vì sao.
   */
  it('danh sách không theo dõi ngày lập thì bộ lọc kỳ không đụng tới nó', () => {
    const rowsWithoutDate = ROWS.map(({ createdAt: _bo, ...rest }) => rest);
    renderWithApp(table({ rows: rowsWithoutDate }), { route: '/hd/hop-dong?ky=thang-nay' });

    expect(inTable().getByText('Hợp đồng nhà xưởng Long An')).toBeInTheDocument();
    expect(inTable().getByText('Hợp đồng kho lạnh')).toBeInTheDocument();
  });

  it('giá trị lạ trên thanh địa chỉ thì coi như không lọc, không phải màn hình trắng', () => {
    renderWithApp(table(), { route: '/hd/hop-dong?trang-thai=khong-co-that' });
    expect(inTable().getByText('Hợp đồng nhà xưởng Long An')).toBeInTheDocument();
    expect(inTable().getByText('Hợp đồng kho lạnh')).toBeInTheDocument();
  });

  it('gõ từ khoá thì lọc theo mã, tên và người chịu trách nhiệm', async () => {
    renderWithApp(table());
    await userEvent.type(screen.getByRole('searchbox'), 'kho lạnh');

    expect(inTable().getByText('Hợp đồng kho lạnh')).toBeInTheDocument();
    expect(inTable().queryByText('Hợp đồng nhà xưởng Long An')).not.toBeInTheDocument();
  });

  it('lọc không ra kết quả thì nói rõ là do bộ lọc, không dùng lời trạng thái rỗng', async () => {
    renderWithApp(table());
    await userEvent.type(screen.getByRole('searchbox'), 'không tồn tại');

    expect(screen.getByText(/Thử điều chỉnh bộ lọc/)).toBeInTheDocument();
    expect(screen.queryByText('Chưa có hợp đồng nào.')).not.toBeInTheDocument();
  });
});

describe('EntityTable — trạng thái màn hình', () => {
  it('chưa có dữ liệu thì hiện lời gợi ý bước tiếp theo kèm nút', () => {
    renderWithApp(table({ rows: [], emptyAction: <button type="button">Soạn hợp đồng</button> }));
    expect(screen.getByText('Chưa có hợp đồng nào.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soạn hợp đồng' })).toBeInTheDocument();
  });

  it('lỗi thì nói bằng ngôn ngữ nghiệp vụ và có nút thử lại', () => {
    const onRetry = vi.fn();
    renderWithApp(table({ error: new Error('fetch failed'), onRetry }));

    expect(screen.getByText(/Không tải được danh sách/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument();
  });
});

describe('EntityTable — cột Pháp nhân khi gộp "Toàn NVG"', () => {
  it('xem một pháp nhân thì KHÔNG hiện cột — thanh bên đã nói rồi', () => {
    setScope(false);
    renderWithApp(table());
    expect(screen.queryByRole('columnheader', { name: 'Pháp nhân' })).not.toBeInTheDocument();
  });

  it('gộp nhiều pháp nhân thì mỗi dòng phải tự nói nó thuộc công ty nào', () => {
    setScope(true);
    renderWithApp(table());

    expect(screen.getByRole('columnheader', { name: 'Pháp nhân' })).toBeInTheDocument();
    const rows = inTable().getAllByRole('row');
    expect(within(rows[1]!).getByText('NVC')).toBeInTheDocument();
  });

  it('bảng DÙNG CHUNG giữa các pháp nhân thì KHÔNG chèn cột rỗng', () => {
    // `customers`/`suppliers` cố ý không có `company_id` (Backend Schema 2.2). Chèn cột thì mọi
    // dòng hiện dấu gạch, đọc ra thành "hồ sơ chưa được gán pháp nhân" — một việc còn thiếu cần
    // đi sửa, trong khi sự thật là pháp nhân không áp dụng ở đây.
    setScope(true);
    renderWithApp(table({ sharedAcrossCompanies: true }));
    expect(screen.queryByRole('columnheader', { name: 'Pháp nhân' })).not.toBeInTheDocument();
  });
});

/**
 * Mỗi màn hình chỉ được có ĐÚNG MỘT hành động chính (Content Guidelines 6.3).
 *
 * Lỗi đã có thật: khi danh sách rỗng, nút "Tạo … mới" hiện đồng thời ở header và trong trạng
 * thái rỗng — cùng một việc, hai nút, hai kiểu dáng khác nhau trên cùng một màn hình.
 */
describe('useCreateActions', () => {
  function actionsFor(args: Parameters<typeof useCreateActions>[0]) {
    let result: ReturnType<typeof useCreateActions> | undefined;
    function Probe() {
      result = useCreateActions(args);
      return null;
    }
    renderWithApp(<Probe />);
    return result!;
  }

  it('danh sách rỗng thì chỉ trạng thái rỗng mời tạo mới, header nhường chỗ', () => {
    const { headerAction, emptyAction } = actionsFor({
      canCreate: true,
      label: 'Tạo cơ hội mới',
      to: '/crm/co-hoi/tao-moi',
      isEmpty: true,
    });
    expect(headerAction).toBeUndefined();
    expect(emptyAction).toBeDefined();
  });

  it('danh sách có dữ liệu thì nút nằm ở header', () => {
    const { headerAction } = actionsFor({
      canCreate: true,
      label: 'Tạo cơ hội mới',
      to: '/crm/co-hoi/tao-moi',
      isEmpty: false,
    });
    expect(headerAction).toBeDefined();
  });

  it('không có quyền tạo thì ẩn cả hai, không hiện rồi mới báo lỗi', () => {
    const { headerAction, emptyAction } = actionsFor({
      canCreate: false,
      label: 'Tạo cơ hội mới',
      to: '/crm/co-hoi/tao-moi',
      isEmpty: true,
    });
    expect(headerAction).toBeUndefined();
    expect(emptyAction).toBeUndefined();
  });
});

describe('listPathFiltered', () => {
  it('mang theo CẢ trạng thái lẫn kỳ báo cáo', () => {
    expect(listPathFiltered('/hd/hop-dong', { status: 'overdue', period: 'quy-nay' })).toBe(
      '/hd/hop-dong?trang-thai=overdue&ky=quy-nay',
    );
  });

  it('không có bộ lọc nào thì không đính đuôi rỗng vào đường dẫn', () => {
    expect(listPathFiltered('/hd/hop-dong', {})).toBe('/hd/hop-dong');
  });
});

describe('EntityTable — thời hạn của hồ sơ đã xong', () => {
  it('hồ sơ Hoàn thành không đếm «Còn N ngày» — thời hạn không còn là việc phải làm', () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const rows: EntityRow[] = [
      { ...ROWS[0]!, id: 'a', title: 'Đơn đã giao đủ', status: 'completed', deadline: future },
      { ...ROWS[0]!, id: 'b', title: 'Đơn đang giao', status: 'in_progress', deadline: future },
    ];
    renderWithApp(table({ rows }), { route: '/hd/hop-dong' });

    const done = inTable().getByText('Đơn đã giao đủ').closest('tr')!;
    const open = inTable().getByText('Đơn đang giao').closest('tr')!;
    expect(within(done).queryByText(/Còn \d+ ngày/)).toBeNull();
    expect(within(open).getByText(/Còn \d+ ngày/)).toBeInTheDocument();
  });
});
