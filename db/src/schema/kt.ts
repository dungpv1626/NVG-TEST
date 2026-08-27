/**
 * Module KT — Kế toán và Tài chính (Backend Schema Mục 4.9).
 * Giai đoạn 2 — khép lại vòng "Hợp đồng → Chi phí → Thu tiền → Lãi/lỗ".
 *
 * Backend Schema 4.9 liệt kê 5 bảng; ở đây có 8. Ba bảng thêm đều là bảng DÒNG hoặc bảng
 * LỊCH SỬ của một bảng đã có tên trong tài liệu, không phải khái niệm mới:
 *
 *   payment_request_allocations ← KT-05 yêu cầu "hỗ trợ cấu hình nguyên tắc PHÂN BỔ cho chi
 *                                 phí dùng chung". Một khoản chi chia cho ba công trình mà
 *                                 chỉ có một cột `cost_code` thì không phân bổ được gì.
 *   payment_request_steps       ← KT-01 có bốn bước xử lý nối nhau, KT-02 đòi hiển thị "đang
 *                                 ở bước nào, chờ ai, quá hạn bao lâu". Backend Schema 2.3
 *                                 buộc ghi lịch sử vào bảng riêng thay vì ghi đè.
 *   receivable_settlements      ← KT-04 "hỗ trợ đối chiếu định kỳ" và HD-03 "đã thu, còn phải
 *                                 thu". Một cột `settled_amount` bị cộng dồn tại chỗ thì
 *                                 không trả lời được thu ngày nào, chứng từ nào.
 *
 * ⚠️ CỐ Ý CHƯA làm ở bước này, không phải quên:
 *   - KT-08 xuất sang phần mềm kế toán: cột `posted_at`/`posted_reference` đã có sẵn để
 *     đánh dấu "đã chuyển", nhưng ĐỊNH DẠNG xuất thì chưa — NVG chưa chốt dùng MISA SME,
 *     AMIS hay Fast (PRD Mục 10). Làm khung trước, điền định dạng sau.
 *   - KT-07 báo cáo lãi/lỗ: thuộc Module BC mức đầy đủ, đọc từ `project_budgets` và các
 *     bảng ở đây chứ không sinh thêm bảng.
 *   - Số dư ngân hàng thật: hệ thống KHÔNG kết nối ngân hàng điện tử (PRD Mục 9). Số dư đầu
 *     kỳ trong kế hoạch dòng tiền do Tài chính nhập tay.
 */

import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './_audit';
import {
  accountingPeriodStatusEnum,
  advanceStatusEnum,
  approvalDecisionEnum,
  cashFlowPeriodTypeEnum,
  costGroupEnum,
  partyTypeEnum,
  paymentCheckStepEnum,
  paymentMethodEnum,
  paymentRequestStageEnum,
  paymentRequestTypeEnum,
  receivableDirectionEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped, optionalCompanyScoped } from './_scoped';
import { customers } from './crm';
import { contracts } from './hd';
import { deliveries, purchaseOrders, suppliers } from './mh';
import { constructionSites } from './tc';
import { users } from './users';

/* ========================================================================== *
 * Đề nghị thanh toán / tạm ứng / hoàn ứng — KT-01, KT-02
 * ========================================================================== */

/**
 * Đề nghị chi tiền (KT-01).
 *
 * Ba loại đi chung một bảng vì đi chung một luồng duyệt — xem lý do ở `@nvg/shared/kt`.
 *
 * `stage` là câu trả lời trực tiếp cho vướng mắc #6 trong khảo sát ("không biết hồ sơ đang
 * nằm ở đâu"): mỗi bước của KT-01 là một giá trị riêng, không gộp thành một chữ "đang chờ".
 *
 * Bộ chứng từ nối sang Module MH bằng ba cột tham chiếu (`purchase_order_id`,
 * `delivery_id`, `contract_id`) — MH-08 yêu cầu chuyển hồ sơ sang Kế toán mà KHÔNG nhập lại
 * dữ liệu. Cả ba đều rỗng nghĩa là khoản chi không đi qua mua hàng (điện nước, phí, lương
 * khoán tổ đội).
 */
export const paymentRequests = pgTable(
  'payment_requests',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    requestType: paymentRequestTypeEnum('request_type').notNull().default('thanh_toan'),
    title: text('title').notNull(),

    stage: paymentRequestStageEnum('stage').notNull().default('nhap'),

    /**
     * Tổng số tiền đề nghị, đồng. Phải bằng tổng các dòng phân bổ tại thời điểm gửi đi —
     * kiểm trong `submit_payment_request`, không kiểm bằng ràng buộc CSDL vì hai bên được
     * phép lệch trong lúc còn soạn nháp.
     */
    amount: money('amount')
      .notNull()
      .default(sql`0`),

    /** Bộ phận đề nghị — KT-02 "gắn … bộ phận, người đề nghị". */
    department: varchar('department', { length: 128 }),

    /**
     * Module sở hữu khoản chi này — quyết định AI là "trưởng đơn vị" ở bước xác nhận đầu
     * tiên của KT-01. Xem chú thích ở hàm `payment_unit_confirmer` trong migration.
     */
    originModule: varchar('origin_module', { length: 8 }).notNull().default('KT'),

    /** Người thụ hưởng bên ngoài. Rỗng với tạm ứng — khi đó người nhận là `advanceUserId`. */
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
    /** Tên bên nhận khi chưa có hồ sơ nhà cung cấp (tổ đội khoán, cá nhân cho thuê mặt bằng). */
    payeeName: varchar('payee_name', { length: 255 }),

    /** Người nhận tạm ứng — bắt buộc với `request_type = 'tam_ung'` (kiểm khi gửi đi). */
    advanceUserId: uuid('advance_user_id').references(() => users.id, { onDelete: 'restrict' }),

    /** Hạn phải hoàn ứng — KT-03. Chỉ có nghĩa với đề nghị tạm ứng. */
    advanceDueDate: date('advance_due_date'),

    /**
     * Lý do được cấp tạm ứng mới khi khoản cũ chưa hoàn — KT-03 cho phép "trừ trường hợp
     * được người có thẩm quyền phê duyệt". Có giá trị nghĩa là người duyệt PHẢI đọc.
     */
    advanceOverrideReason: text('advance_override_reason'),

    /**
     * Khoản tạm ứng mà đề nghị này quyết toán — bắt buộc với `request_type = 'hoan_ung'`.
     * Không có nó thì hoàn ứng là một khoản chi lơ lửng, không trừ vào nợ của ai.
     *
     * CHƯA có khoá ngoại ở tầng Drizzle: `advances` tham chiếu ngược lại bảng này, khai hai
     * chiều sẽ tạo vòng và TypeScript mất kiểu. Ràng buộc thật thêm bằng `ALTER TABLE` trong
     * migration RLS — giống cách `project_budgets.construction_site_id` đã làm.
     */
    settlesAdvanceId: uuid('settles_advance_id'),

    /**
     * Khoản công nợ PHẢI TRẢ mà đề nghị này thanh toán. Rỗng với khoản chi không theo dõi
     * công nợ (tạm ứng, chi vặt). Có giá trị thì lúc ghi nhận đã chi, hệ thống tự ghi một
     * dòng vào lịch sử thanh toán của khoản nợ — KT-04, không nhập lại lần thứ hai.
     *
     * Khoá ngoại cũng thêm bằng `ALTER TABLE` trong migration RLS, cùng lý do ở trên.
     */
    receivableId: uuid('receivable_id'),

    /** Bộ chứng từ nguồn — MH-08. */
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    deliveryId: uuid('delivery_id').references(() => deliveries.id, { onDelete: 'set null' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),

    /** Kỳ kế toán của khoản chi, `yyyy-MM` — dùng để chặn ghi vào kỳ đã khóa (KT-09). */
    accountingPeriod: varchar('accounting_period', { length: 7 }),

    /** Ngày đề nghị được thanh toán — cột "thời hạn" cố định của mẫu Danh sách. */
    dueDate: date('due_date'),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    /* --- Thực hiện chi (KT-01 bước 6 và 7) --- */
    paymentMethod: paymentMethodEnum('payment_method'),
    paidDate: date('paid_date'),
    /** Số phiếu chi hoặc số ủy nhiệm chi. KHÔNG lưu số tài khoản cá nhân (CLAUDE.md 5.2). */
    paymentReference: varchar('payment_reference', { length: 64 }),
    paidAmount: money('paid_amount')
      .notNull()
      .default(sql`0`),

    /* --- Hạch toán / chuyển sang phần mềm kế toán (KT-01 bước 8, KT-08) --- */
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedReference: varchar('posted_reference', { length: 64 }),

    /** Lý do hủy hoặc lý do bị từ chối — không đóng hồ sơ mà không nói vì sao. */
    closedReason: text('closed_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('payment_requests_list_idx').on(t.companyId, t.stage, t.dueDate),
    index('payment_requests_supplier_idx').on(t.supplierId),
    index('payment_requests_contract_idx').on(t.contractId),
    index('payment_requests_order_idx').on(t.purchaseOrderId),
    index('payment_requests_advance_user_idx').on(t.advanceUserId),
    index('payment_requests_period_idx').on(t.companyId, t.accountingPeriod),
    uniqueIndex('payment_requests_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

/**
 * Phân bổ một khoản chi vào các mã chi phí — KT-05.
 *
 * Mỗi dòng là một cặp (công trình, mã chi phí) kèm số tiền. Với khoản chi của một công
 * trình thì chỉ có một dòng; với chi phí dùng chung (thuê văn phòng, xe đưa đón) thì có
 * nhiều dòng và tổng của chúng phải bằng `payment_requests.amount`.
 *
 * ⚠️ KHÔNG có cột "tiêu thức phân bổ" tự động. KT-05 liệt kê bốn tiêu thức (doanh thu, nhân
 * sự, diện tích, thời gian sử dụng), nhưng chọn tiêu thức nào cho khoản nào là quyết định
 * của Kế toán theo quy chế của NVG — quy chế đó chưa có (PRD Mục 10). Bảng này lưu KẾT QUẢ
 * phân bổ mà người dùng nhập; khi có quy chế thì thêm hàm gợi ý, vẫn ở dạng đề xuất.
 */
export const paymentRequestAllocations = pgTable(
  'payment_request_allocations',
  {
    id: primaryId(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'cascade' }),

    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    /** Mã chi phí trong ngân sách công trình — khớp `project_budgets.cost_code`. */
    costCode: varchar('cost_code', { length: 64 }),
    costGroup: costGroupEnum('cost_group').notNull().default('chi_phi_chung'),

    amount: money('amount')
      .notNull()
      .default(sql`0`),

    /** Căn cứ phân bổ — bắt buộc đọc được khi một khoản chia cho nhiều công trình. */
    basis: text('basis'),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [
    index('payment_request_allocations_idx').on(t.paymentRequestId),
    index('payment_request_allocations_site_idx').on(t.constructionSiteId, t.costCode),
  ],
);

/**
 * Lịch sử từng bước xử lý của một đề nghị chi — KT-01, KT-02.
 *
 * Mỗi lượt xác nhận/từ chối là MỘT DÒNG, không ghi đè (Backend Schema 2.3). Nhờ vậy trả lời
 * được "quá hạn bao lâu" ở từng bước chứ không chỉ ở cả hồ sơ: `entered_at` của bước sau trừ
 * `entered_at` của bước trước là thời gian bước đó đã giữ hồ sơ.
 *
 * Bước phê duyệt theo hạn mức KHÔNG ghi ở đây mà ở `approval_decisions` — Hộp thư Phê duyệt
 * là một màn hình chung cho mọi module (Webapp Flow 4.6), và tách hai nơi thì lịch sử duyệt
 * tiền của mọi module vẫn đọc được ở cùng một chỗ.
 */
export const paymentRequestSteps = pgTable(
  'payment_request_steps',
  {
    id: primaryId(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'cascade' }),

    step: paymentCheckStepEnum('step').notNull(),
    decision: approvalDecisionEnum('decision').notNull(),

    /** Ghi chú kiểm tra hoặc lý do trả lại — bắt buộc khi từ chối. */
    note: text('note'),

    /** Thời điểm hồ sơ ĐẾN bước này — để đo hồ sơ nằm chờ bao lâu (KT-02). */
    enteredAt: timestamp('entered_at', { withTimezone: true }),

    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_request_steps_idx').on(t.paymentRequestId, t.decidedAt)],
);

/* ========================================================================== *
 * Tạm ứng đang theo dõi — KT-03
 * ========================================================================== */

/**
 * Khoản tiền ĐÃ ứng ra và chưa hoàn xong.
 *
 * Khác `payment_requests` loại `tam_ung` ở chỗ: bảng kia là ĐỀ NGHỊ (có thể bị từ chối),
 * bảng này là KHOẢN NỢ đã phát sinh. Một dòng ở đây sinh ra đúng lúc `record_payment` ghi
 * nhận tiền đã chi cho một đề nghị tạm ứng — không sinh sớm hơn, vì đề nghị được duyệt mà
 * chưa chi thì chưa ai nợ ai.
 *
 * ⚠️ KHÔNG lưu tài khoản ngân hàng cá nhân của người nhận (CLAUDE.md 5.2).
 */
export const advances = pgTable(
  'advances',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Đề nghị tạm ứng đã chi sinh ra khoản này — đường truy ngược bắt buộc (PRD Mục 7). */
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'restrict' }),

    /** Người nhận tạm ứng. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    purpose: text('purpose').notNull(),

    amount: money('amount')
      .notNull()
      .default(sql`0`),
    /** Đã hoàn cộng dồn. Chỉ hàm `settle_advance` ghi cột này. */
    settledAmount: money('settled_amount')
      .notNull()
      .default(sql`0`),

    advanceDate: date('advance_date').notNull(),
    /** Hạn hoàn ứng — KT-03 "cảnh báo các khoản quá hạn". */
    dueDate: date('due_date'),

    status: advanceStatusEnum('status').notNull().default('dang_no'),
    settledAt: timestamp('settled_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('advances_user_idx').on(t.userId, t.status, t.dueDate),
    index('advances_company_idx').on(t.companyId, t.status),
    uniqueIndex('advances_one_per_request').on(t.paymentRequestId),
  ],
);

/* ========================================================================== *
 * Công nợ phải thu – phải trả — KT-04
 * ========================================================================== */

/**
 * Một khoản công nợ đang theo dõi.
 *
 * Hai chiều (`phai_thu` / `phai_tra`) chung một bảng: cùng cấu trúc, cùng cách tính tuổi
 * nợ, cùng màn hình đối chiếu. Tách hai bảng thì mọi báo cáo tổng hợp phải hợp nhất hai
 * truy vấn, và bảng tuổi nợ phải viết hai lần.
 *
 * `settled_amount` là số cộng dồn từ `receivable_settlements` — chỉ trigger của bảng con
 * ghi cột này, để phần "đã thu" không bao giờ lệch với danh sách chứng từ thu.
 */
export const receivablesPayables = pgTable(
  'receivables_payables',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    direction: receivableDirectionEnum('direction').notNull(),
    partyType: partyTypeEnum('party_type').notNull(),

    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
    /** Tên đối tác khi chưa có hồ sơ trong danh mục. */
    partyName: varchar('party_name', { length: 255 }),

    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),

    /** Số hóa đơn — KT-04 theo dõi công nợ "theo … hóa đơn". */
    invoiceNumber: varchar('invoice_number', { length: 64 }),
    invoiceDate: date('invoice_date'),

    /** Diễn giải: đợt thanh toán nào của hợp đồng, nghiệm thu đợt mấy. */
    description: text('description'),

    amount: money('amount')
      .notNull()
      .default(sql`0`),
    settledAmount: money('settled_amount')
      .notNull()
      .default(sql`0`),

    dueDate: date('due_date'),

    settledAt: timestamp('settled_at', { withTimezone: true }),

    /** Lần đối chiếu chính thức gần nhất — KT-04 "hằng tháng đối chiếu chính thức". */
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: uuid('reconciled_by').references(() => users.id, { onDelete: 'set null' }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('receivables_list_idx').on(t.companyId, t.direction, t.dueDate),
    index('receivables_customer_idx').on(t.customerId),
    index('receivables_supplier_idx').on(t.supplierId),
    index('receivables_contract_idx').on(t.contractId),
    uniqueIndex('receivables_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

/**
 * Một lần thu tiền hoặc trả tiền cho một khoản công nợ — KT-04, HD-03.
 *
 * Đây là chỗ con số "đã thu" của hợp đồng có nguồn gốc: mỗi dòng ở đây cộng vào
 * `contracts.collected_amount` qua trigger, nên số trên màn hình Hợp đồng luôn truy ngược
 * được tới từng chứng từ, thay vì là một cột ai cũng sửa được.
 */
export const receivableSettlements = pgTable(
  'receivable_settlements',
  {
    id: primaryId(),
    receivableId: uuid('receivable_id')
      .notNull()
      .references(() => receivablesPayables.id, { onDelete: 'cascade' }),

    settledDate: date('settled_date').notNull(),
    amount: money('amount')
      .notNull()
      .default(sql`0`),

    method: paymentMethodEnum('method'),
    /** Số chứng từ thu/chi hoặc số giao dịch ngân hàng. */
    reference: varchar('reference', { length: 64 }),

    /** Đề nghị chi sinh ra lần trả này — có với công nợ phải trả, rỗng với phải thu. */
    paymentRequestId: uuid('payment_request_id').references(() => paymentRequests.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [index('receivable_settlements_idx').on(t.receivableId, t.settledDate)],
);

/* ========================================================================== *
 * Kế hoạch dòng tiền — KT-06
 * ========================================================================== */

/**
 * Kế hoạch thu – chi một kỳ (tuần hoặc tháng), theo pháp nhân và tùy chọn theo công trình.
 *
 * `opening_balance` do Tài chính NHẬP TAY: hệ thống không kết nối ngân hàng điện tử (PRD
 * Mục 9), nên tự suy ra số dư là bịa. Ghi rõ nguồn số dư ở `balance_note` để lần sau đọc
 * lại còn biết con số lấy từ đâu và tại thời điểm nào.
 */
export const cashFlowPlans = pgTable(
  'cash_flow_plans',
  {
    id: primaryId(),
    ...companyScoped(),

    periodType: cashFlowPeriodTypeEnum('period_type').notNull().default('thang'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),

    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    openingBalance: money('opening_balance')
      .notNull()
      .default(sql`0`),
    balanceNote: text('balance_note'),

    plannedIn: money('planned_in')
      .notNull()
      .default(sql`0`),
    plannedOut: money('planned_out')
      .notNull()
      .default(sql`0`),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('cash_flow_plans_idx').on(t.companyId, t.periodStart),
    /** Mỗi pháp nhân/công trình chỉ có MỘT kế hoạch cho một kỳ — hai bản là hai con số. */
    uniqueIndex('cash_flow_plans_period')
      .on(t.companyId, t.periodType, t.periodStart, t.constructionSiteId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/* ========================================================================== *
 * Khung tuổi nợ — KT-04
 * ========================================================================== */

/**
 * Các mốc chia nhóm công nợ quá hạn — CẤU HÌNH ĐƯỢC, không hard-code.
 *
 * Cùng lý do với `approval_limits` (PRD NEN-02, CLAUDE.md 5.2): NVG chưa ban hành mốc chính
 * thức. Giá trị khởi tạo 30/60/90 ngày là GIẢ ĐỊNH, seed từ `DEFAULT_AGING_BUCKETS` ở
 * `@nvg/shared/kt`; khi NVG chốt mốc thật thì sửa trong Quản trị hệ thống, KHÔNG sửa mã.
 *
 * Bảng chỉ chứa các khung QUÁ HẠN. "Chưa đến hạn" không nằm ở đây vì nó không phải một mốc do
 * NVG chọn mà là tình trạng "chưa trễ ngày nào" — xoá nhầm dòng đó là mất luôn chỗ chứa các
 * khoản còn trong hạn, và chúng sẽ rơi vào một khung quá hạn nào đó.
 *
 * `company_id` rỗng = áp dụng cho mọi pháp nhân. Có giá trị = mốc riêng của pháp nhân đó, cho
 * phép NVS (bán hàng, vòng quay ngắn) đặt mốc chặt hơn NVC (thi công, thanh toán theo đợt).
 */
export const agingBuckets = pgTable(
  'aging_buckets',
  {
    id: primaryId(),
    ...optionalCompanyScoped(),

    /** Mã khung — khoá khi cộng số, không hiển thị cho người dùng. */
    code: varchar('code', { length: 32 }).notNull(),
    label: text('label').notNull(),

    /** Thứ tự hiển thị trên bảng tuổi nợ, từ nhẹ tới nặng. */
    position: integer('position').notNull().default(0),

    /** Số ngày quá hạn tối thiểu để rơi vào khung này. Nhỏ nhất là 1. */
    fromDays: integer('from_days').notNull(),
    /** Số ngày quá hạn tối đa. Rỗng = khung cuối, không có giới hạn trên. */
    toDays: integer('to_days'),

    isActive: boolean('is_active').notNull().default(true),

    ...auditColumns(),
  },
  (t) => [
    index('aging_buckets_order_idx').on(t.companyId, t.position),
    uniqueIndex('aging_buckets_code').on(t.companyId, t.code),
  ],
);

/* ========================================================================== *
 * Kỳ kế toán — KT-09
 * ========================================================================== */

/**
 * Kỳ kế toán tháng và trạng thái khóa.
 *
 * Khóa kỳ là ràng buộc THẬT ở tầng CSDL, không phải nhãn hiển thị: trigger trên các bảng
 * chứng từ của module này từ chối ghi/sửa bản ghi có ngày nằm trong kỳ đã khóa (KT-09).
 *
 * Mở lại một kỳ đã khóa bắt buộc có `reopen_reason` và người mở — "mọi điều chỉnh sau khi
 * đã khóa phải ghi rõ nguyên nhân và người phê duyệt" (KT-09).
 */
export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Mã kỳ `yyyy-MM` — xem `accountingPeriodCode` ở `@nvg/shared/kt`. */
    periodCode: varchar('period_code', { length: 7 }).notNull(),

    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),

    status: accountingPeriodStatusEnum('status').notNull().default('dang_mo'),

    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),

    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    reopenedBy: uuid('reopened_by').references(() => users.id, { onDelete: 'set null' }),
    reopenReason: text('reopen_reason'),

    /** Đã chuyển số liệu sang phần mềm kế toán chính thức chưa — KT-08. */
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    exportedBy: uuid('exported_by').references(() => users.id, { onDelete: 'set null' }),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [uniqueIndex('accounting_periods_unique').on(t.companyId, t.periodCode)],
);

export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type NewPaymentRequest = typeof paymentRequests.$inferInsert;
export type PaymentRequestAllocation = typeof paymentRequestAllocations.$inferSelect;
export type PaymentRequestStep = typeof paymentRequestSteps.$inferSelect;
export type Advance = typeof advances.$inferSelect;
export type ReceivablePayable = typeof receivablesPayables.$inferSelect;
export type ReceivableSettlement = typeof receivableSettlements.$inferSelect;
export type CashFlowPlan = typeof cashFlowPlans.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type AgingBucket = typeof agingBuckets.$inferSelect;
