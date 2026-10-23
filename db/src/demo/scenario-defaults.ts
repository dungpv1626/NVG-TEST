/**
 * Tham số DEMO cho mọi con số NVG chưa quyết — anh Dũng 23/10/2026: «dữ kiện nào chưa có thì tự
 * lấy demo mặc định».
 *
 * Migration cố ý để các tham số này TRỐNG (CLAUDE.md 5.2): bản vận hành phải dùng số NVG tự đặt,
 * không phải số do máy dựng. Vì vậy số demo nằm ở trình nạp dữ liệu demo, không nằm ở migration
 * hay seed — chỉ chạy khi chủ động nạp demo (`npm run db:demo-data -- --only=mac-dinh`). Mỗi giá
 * trị CHỈ ghi khi ô còn trống: số người dùng đã đặt trên trang Tham số hệ thống không bị đè.
 *
 * Ghi bằng tài khoản Quản trị (tham số, thời hạn xử lý) và Kho (mức tồn tối thiểu) — đúng đường
 * màn hình đi, qua RLS và trigger lịch sử tham số. Công tắc AI tốn tiền KHÔNG bật ở đây: đó là
 * quyết định chi phí, không phải dữ kiện thiếu.
 */

import { check, signIn } from './client';

const ADMIN = 'admin@nhavietgroup.test';

/** Số ngày / phần trăm / tỷ lệ — một giá trị chung toàn hệ thống. */
const GLOBAL_NUMBERS: Record<string, number> = {
  'tc.warranty_response_days': 7,
  'hd.expiring_soon_days': 90,
  'ksnb.near_limit_percent': 90,
  'ksnb.acceptance_unsigned_days': 7,
  'kt.collection_remind_days_before': 7,
  'mh.order_due_soon_days': 3,
  'hc.document_remind_days': 30,
  'ns.contract_remind_days': 30,
  'da.document_remind_days': 30,
  'da.deadline_remind_days': 7,
  'sx.rental_remind_days': 3,
  defect_rate_threshold: 0.03,
  min_samples_for_metric: 5,
};

/** Đơn giá thuê / ngày theo mã giàn giáo (đồng). Giá thuê nội bộ = 70 % giá ngoài (QĐ-6). */
const RENTAL_DAILY_RATE: Record<string, number> = {
  'GIANGIAO-NEM-150': 2_500,
  'GIANGIAO-MAMSAN-1200': 3_000,
  'GIANGIAO-KICH-U600': 1_500,
};
const INTERNAL_RATE_RATIO = 0.7;

/** Bảng giá bồi thường theo mã: mất / hỏng (đồng một cái). */
const COMPENSATION: Record<string, { mat: number; hong: number }> = {
  'GIANGIAO-NEM-150': { mat: 450_000, hong: 150_000 },
  'GIANGIAO-MAMSAN-1200': { mat: 600_000, hong: 200_000 },
  'GIANGIAO-KICH-U600': { mat: 250_000, hong: 80_000 },
};

/** Thời hạn xử lý (giờ) theo loại phê duyệt — áp mọi pháp nhân, mọi phòng tiếp nhận. */
const SLA_HOURS: Record<string, { hours: number; label: string }> = {
  quote_price: { hours: 24, label: 'Duyệt giá báo giá' },
  survey_report: { hours: 24, label: 'Duyệt báo cáo khảo sát' },
  purchase_request: { hours: 24, label: 'Duyệt đề nghị mua' },
  payment_request: { hours: 48, label: 'Duyệt đề nghị thanh toán' },
  advance: { hours: 48, label: 'Duyệt tạm ứng' },
  contract: { hours: 48, label: 'Duyệt hợp đồng' },
  contract_amendment: { hours: 48, label: 'Duyệt phụ lục hợp đồng' },
  estimate_price: { hours: 72, label: 'Duyệt giá dự toán' },
};

/** Mức tồn tối thiểu cho vật tư chưa đặt mức: 15 % số đang tồn, làm tròn. */
const MIN_STOCK_RATIO = 0.15;

const DEMO_NOTE =
  'Giá trị DEMO (anh Dũng 23/10/2026: lấy số mặc định khi NVG chưa quyết) — NVG thay.';

export async function loadDefaults(): Promise<'created' | 'skipped'> {
  const admin = await signIn(ADMIN);
  const kho = await signIn('kho@nhavietgroup.test');
  let wrote = 0;

  // --- 1. Tham số chung còn trống ------------------------------------------------------------
  const { data: params } = await admin
    .from('system_parameters')
    .select('id, param_key, value, description')
    .eq('scope_type', 'global')
    .in('param_key', [...Object.keys(GLOBAL_NUMBERS), 'compensation_price_table'])
    .is('scope_id', null);
  for (const p of (params ?? []) as {
    id: string;
    param_key: string;
    value: unknown;
    description: string | null;
  }[]) {
    if (p.value !== null) continue;
    const value =
      p.param_key === 'compensation_price_table' ? COMPENSATION : GLOBAL_NUMBERS[p.param_key];
    if (value === undefined) continue;
    check(
      `đặt tham số demo ${p.param_key}`,
      await admin
        .from('system_parameters')
        .update({ value, description: `${p.description ?? ''} ${DEMO_NOTE}`.trim() })
        .eq('id', p.id),
    );
    wrote++;
  }

  // --- 2. Đơn giá thuê + giá thuê nội bộ theo mã sản phẩm --------------------------------------
  const { data: materials } = await admin
    .from('materials')
    .select('id, code')
    .in('code', Object.keys(RENTAL_DAILY_RATE));
  for (const m of (materials ?? []) as { id: string; code: string }[]) {
    const rate = RENTAL_DAILY_RATE[m.code]!;
    for (const [key, value, unit, label] of [
      ['sx.rental_daily_rate', rate, 'đồng/ngày', 'Đơn giá thuê giàn giáo / ngày theo mã sản phẩm'],
      [
        'internal_rental_price',
        Math.round(rate * INTERNAL_RATE_RATIO),
        'đồng/ngày',
        'Giá thuê giàn giáo nội bộ giữa các pháp nhân NVG',
      ],
    ] as const) {
      const { data: existing } = await admin
        .from('system_parameters')
        .select('id')
        .eq('param_key', key)
        .eq('scope_type', 'product')
        .eq('scope_id', m.id)
        .maybeSingle();
      if (existing) continue;
      check(
        `đặt ${key} demo cho ${m.code}`,
        await admin.from('system_parameters').insert({
          param_key: key,
          scope_type: 'product',
          scope_id: m.id,
          value,
          unit,
          label: `${label} — ${m.code}`,
          description: DEMO_NOTE,
        }),
      );
      wrote++;
    }
  }

  // --- 3. Thời hạn xử lý theo loại phê duyệt ----------------------------------------------------
  const { data: slas } = await admin.from('sla_definitions').select('request_type');
  const haveSla = new Set(((slas ?? []) as { request_type: string }[]).map((s) => s.request_type));
  for (const [type, s] of Object.entries(SLA_HOURS)) {
    if (haveSla.has(type)) continue;
    check(
      `đặt thời hạn xử lý demo ${type}`,
      await admin
        .from('sla_definitions')
        .insert({ request_type: type, target_hours: s.hours, label: `${s.label} (DEMO)` }),
    );
    wrote++;
  }

  // --- 4. Mức tồn tối thiểu cho vật tư chưa đặt mức ---------------------------------------------
  const { data: items } = await kho
    .from('inventory_items')
    .select('id, quantity_on_hand, min_quantity')
    .is('min_quantity', null);
  for (const i of (items ?? []) as { id: string; quantity_on_hand: number | string }[]) {
    const min = Math.max(1, Math.round(Number(i.quantity_on_hand) * MIN_STOCK_RATIO));
    check(
      'đặt mức tồn tối thiểu demo',
      await kho.from('inventory_items').update({ min_quantity: min }).eq('id', i.id),
    );
    wrote++;
  }

  return wrote > 0 ? 'created' : 'skipped';
}
