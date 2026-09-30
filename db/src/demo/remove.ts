/**
 * Gỡ dữ liệu do trình nạp demo tạo — theo GỐC, trong MỘT giao dịch.
 *
 * Dùng khi phải nạp lại (đổi kịch bản, hoặc đưa bộ đếm số thứ tự về đúng số trước khi nạp).
 * Chỉ đụng hồ sơ mọc ra từ các gốc liệt kê dưới đây; dữ liệu khác trên cùng CSDL giữ nguyên.
 * Chạy trên bản demo phải gọi tường minh như trình nạp (`NVG_DB_TARGET=demo` + `--confirm`).
 *
 * Đi đường kết nối trực tiếp (vượt RLS) vì đây là thao tác quản trị: người dùng không xoá cứng
 * được chứng từ, và đúng là không nên.
 */

import { createConnection } from '../client';
import { NVC_OPPORTUNITY } from './scenario-nvc';
import { DEMO_LOT_MATERIALS, NVS_FIRST_RENTAL_CUSTOMER, demoLotCode } from './scenario-nvs';

export const DEMO_CUSTOMERS = [
  'Công ty TNHH Cơ khí Chính xác Hưng Thịnh',
  NVS_FIRST_RENTAL_CUSTOMER,
  'Công ty TNHH Đầu tư Xây dựng Thành An',
];
export const DEMO_SUPPLIERS = [
  'Công ty CP Thép Nam Việt',
  'Công ty TNHH Thép Đại Phát',
  'Công ty TNHH Xây dựng Hùng Cường',
];
/** Vật tư do trình nạp TẠO. `GIANGIAO-NEM-150` có thể có sẵn từ trước nên không nằm ở đây. */
export const DEMO_MATERIALS = ['THEP-HINH-H200', 'GIANGIAO-MAMSAN-1200', 'GIANGIAO-KICH-U600'];
export const DEMO_WAREHOUSES = ['NVC-KHO-PNA'];
/**
 * Lô giàn giáo của trình nạp: đúng mã nó đặt, và các lô tách ra từ đó (mang mã gốc làm tiền tố).
 * KHÔNG dùng tiền tố chung `NVS-GIANGIAO-` — lô người dùng nhập tay cũng mang tiền tố đó.
 */
const DEMO_LOT_PATTERNS = DEMO_LOT_MATERIALS.map((code) => `${demoLotCode(code)}%`);

export async function removeDemoData(): Promise<Record<string, number>> {
  const { sql } = createConnection();
  const counts: Record<string, number> = {};
  try {
    await sql.begin(async (tx) => {
      const del = async (label: string, query: Promise<{ count: number }>) => {
        counts[label] = (await query).count;
      };

      // --- Tập id theo gốc -----------------------------------------------------------------
      await tx`CREATE TEMP TABLE g_customers ON COMMIT DROP AS
        SELECT id FROM customers WHERE name = ANY(${DEMO_CUSTOMERS})`;
      await tx`CREATE TEMP TABLE g_suppliers ON COMMIT DROP AS
        SELECT id FROM suppliers WHERE name = ANY(${DEMO_SUPPLIERS})`;
      await tx`CREATE TEMP TABLE g_opps ON COMMIT DROP AS
        SELECT id FROM opportunities WHERE name = ${NVC_OPPORTUNITY}
           OR customer_id IN (SELECT id FROM g_customers)`;
      await tx`CREATE TEMP TABLE g_bids ON COMMIT DROP AS
        SELECT id FROM bidding_projects WHERE opportunity_id IN (SELECT id FROM g_opps)
           OR customer_id IN (SELECT id FROM g_customers)`;
      await tx`CREATE TEMP TABLE g_contracts ON COMMIT DROP AS
        SELECT id FROM contracts
        WHERE (source_type = 'bidding_projects' AND source_id IN (SELECT id FROM g_bids))
           OR customer_id IN (SELECT id FROM g_customers)`;
      await tx`CREATE TEMP TABLE g_sites ON COMMIT DROP AS
        SELECT id FROM construction_sites WHERE contract_id IN (SELECT id FROM g_contracts)
           OR bidding_project_id IN (SELECT id FROM g_bids)`;
      await tx`CREATE TEMP TABLE g_prs ON COMMIT DROP AS
        SELECT id FROM purchase_requests WHERE construction_site_id IN (SELECT id FROM g_sites)`;
      await tx`CREATE TEMP TABLE g_pos ON COMMIT DROP AS
        SELECT id FROM purchase_orders WHERE purchase_request_id IN (SELECT id FROM g_prs)
           OR supplier_id IN (SELECT id FROM g_suppliers)`;
      await tx`CREATE TEMP TABLE g_pays ON COMMIT DROP AS
        SELECT DISTINCT p.id FROM payment_requests p
        LEFT JOIN payment_request_allocations a ON a.payment_request_id = p.id
        WHERE p.supplier_id IN (SELECT id FROM g_suppliers)
           OR a.construction_site_id IN (SELECT id FROM g_sites)`;
      await tx`CREATE TEMP TABLE g_recv ON COMMIT DROP AS
        SELECT id FROM receivables_payables WHERE contract_id IN (SELECT id FROM g_contracts)
           OR customer_id IN (SELECT id FROM g_customers)
           OR supplier_id IN (SELECT id FROM g_suppliers)`;
      await tx`CREATE TEMP TABLE g_rentals ON COMMIT DROP AS
        SELECT id FROM rental_agreements WHERE customer_id IN (SELECT id FROM g_customers)`;
      await tx`CREATE TEMP TABLE g_estimates ON COMMIT DROP AS
        SELECT id FROM estimates WHERE bidding_project_id IN (SELECT id FROM g_bids)`;
      await tx`CREATE TEMP TABLE g_warehouses ON COMMIT DROP AS
        SELECT id FROM warehouses WHERE code = ANY(${DEMO_WAREHOUSES})
           OR construction_site_id IN (SELECT id FROM g_sites)`;
      await tx`CREATE TEMP TABLE g_all ON COMMIT DROP AS
        SELECT id FROM g_opps UNION SELECT id FROM g_bids UNION SELECT id FROM g_contracts
        UNION SELECT id FROM g_sites UNION SELECT id FROM g_prs UNION SELECT id FROM g_pos
        UNION SELECT id FROM g_pays UNION SELECT id FROM g_recv UNION SELECT id FROM g_rentals
        UNION SELECT id FROM g_estimates`;

      // --- Xoá, con trước cha --------------------------------------------------------------
      await del(
        'thông báo',
        tx`DELETE FROM notifications WHERE related_entity_id IN (SELECT id FROM g_all)`,
      );
      await del('phê duyệt', tx`DELETE FROM approvals WHERE entity_id IN (SELECT id FROM g_all)`);
      await del(
        'lịch sử thúc',
        tx`DELETE FROM request_reminders WHERE entity_id IN (SELECT id FROM g_prs)`,
      );
      await del(
        'thu công nợ',
        tx`DELETE FROM receivable_settlements WHERE receivable_id IN (SELECT id FROM g_recv)`,
      );
      await del(
        'đề nghị chi',
        tx`DELETE FROM payment_requests WHERE id IN (SELECT id FROM g_pays)`,
      );
      await del(
        'công nợ',
        tx`DELETE FROM receivables_payables WHERE id IN (SELECT id FROM g_recv)`,
      );
      await del(
        'chứng từ kho',
        tx`DELETE FROM stock_movements
        WHERE warehouse_id IN (SELECT id FROM g_warehouses)
           OR construction_site_id IN (SELECT id FROM g_sites)
           OR purchase_order_id IN (SELECT id FROM g_pos)`,
      );
      await del(
        'tồn kho',
        tx`DELETE FROM inventory_items WHERE warehouse_id IN (SELECT id FROM g_warehouses)`,
      );
      await del('đơn hàng', tx`DELETE FROM purchase_orders WHERE id IN (SELECT id FROM g_pos)`);
      await del(
        'đề nghị mua',
        tx`DELETE FROM purchase_requests WHERE id IN (SELECT id FROM g_prs)`,
      );
      await del('kho', tx`DELETE FROM warehouses WHERE id IN (SELECT id FROM g_warehouses)`);
      await del(
        'công trình',
        tx`DELETE FROM construction_sites WHERE id IN (SELECT id FROM g_sites)`,
      );
      await del('hợp đồng', tx`DELETE FROM contracts WHERE id IN (SELECT id FROM g_contracts)`);
      await del('gói thầu', tx`DELETE FROM bidding_projects WHERE id IN (SELECT id FROM g_bids)`);
      await del('cơ hội', tx`DELETE FROM opportunities WHERE id IN (SELECT id FROM g_opps)`);
      await del(
        'sự kiện giàn giáo',
        tx`DELETE FROM scaffolding_events WHERE scaffolding_asset_id IN (
        SELECT id FROM scaffolding_assets WHERE asset_code LIKE ANY(${DEMO_LOT_PATTERNS})
           OR current_rental_agreement_id IN (SELECT id FROM g_rentals))`,
      );
      await del(
        'lô giàn giáo',
        tx`DELETE FROM scaffolding_assets
        WHERE asset_code LIKE ANY(${DEMO_LOT_PATTERNS})
           OR current_rental_agreement_id IN (SELECT id FROM g_rentals)`,
      );
      await del(
        'hợp đồng thuê',
        tx`DELETE FROM rental_agreements WHERE id IN (SELECT id FROM g_rentals)`,
      );
      await del('nhà cung cấp', tx`DELETE FROM suppliers WHERE id IN (SELECT id FROM g_suppliers)`);
      await del('khách hàng', tx`DELETE FROM customers WHERE id IN (SELECT id FROM g_customers)`);
      await del(
        'vật tư',
        tx`DELETE FROM materials WHERE code = ANY(${DEMO_MATERIALS})
        AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.material_id = materials.id)
        AND NOT EXISTS (SELECT 1 FROM scaffolding_assets a WHERE a.material_id = materials.id)`,
      );
    });
  } finally {
    await sql.end();
  }
  return counts;
}

/**
 * Đưa bộ đếm số thứ tự về đúng số lớn nhất CÒN TỒN TẠI.
 *
 * Bộ kiểm thử từng chạy trên CSDL này tạo rồi xoá cứng hàng nghìn hồ sơ, nên bộ đếm đứng ở
 * «đề nghị mua số 1895» trong khi số hồ sơ thật chỉ vài cái. Chỉ HẠ tới số đang dùng, không
 * bao giờ thấp hơn — mã đã cấp là bất biến và không được cấp trùng.
 */
export async function compactSequences(): Promise<number> {
  const { sql } = createConnection();
  try {
    const tables = await sql<{ table_name: string }[]>`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'code'`;
    const union = tables
      .map((t) => `SELECT code::text AS code FROM public."${t.table_name}"`)
      .join(' UNION ALL ');
    const changed = await sql.unsafe(`
      WITH used AS (${union}),
      parsed AS (
        SELECT m[1] AS company_code, m[2] AS record_type, m[3]::int AS year, max(m[4]::int) AS max_seq
        FROM used, regexp_matches(code, '^([A-Z]{3})-([A-Z]{2,5})-(\\d{4})-(\\d{4,})$') AS m
        GROUP BY 1, 2, 3
      )
      UPDATE public.record_sequences rs
         SET last_value = COALESCE(p.max_seq, 0)
        FROM public.record_sequences r0
        LEFT JOIN parsed p
          ON p.company_code = r0.company_code AND p.record_type = r0.record_type AND p.year = r0.year
       WHERE rs.company_code = r0.company_code AND rs.record_type = r0.record_type AND rs.year = r0.year
         AND rs.last_value > COALESCE(p.max_seq, 0)
      RETURNING rs.company_code`);
    const catalog = await sql.unsafe(`
      WITH used AS (
        SELECT code FROM public.customers UNION ALL SELECT code FROM public.suppliers
      ),
      parsed AS (
        SELECT m[1] AS record_type, max(m[2]::int) AS max_seq
        FROM used, regexp_matches(code, '^(KH|NCC)-(\\d{5,})$') AS m GROUP BY 1
      )
      UPDATE public.catalog_sequences cs
         SET last_value = COALESCE((SELECT max_seq FROM parsed p WHERE p.record_type = cs.record_type), 0)
       WHERE cs.last_value > COALESCE((SELECT max_seq FROM parsed p WHERE p.record_type = cs.record_type), 0)
      RETURNING cs.record_type`);
    return changed.length + catalog.length;
  } finally {
    await sql.end();
  }
}
