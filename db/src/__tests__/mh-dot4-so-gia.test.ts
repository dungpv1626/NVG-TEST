/**
 * Đợt 4 — 4B: bảng so giá nhà cung cấp (`save_quotation`, `quotation_board`, kho `quotation-files`
 * — migration 0201).
 *
 * Mua hàng nhập báo giá ngay khi đề nghị còn Nháp / Chờ duyệt; bảng đặt cạnh nhau có giá lần mua
 * trước; báo giá thiếu mặt hàng không được xếp hạng; chỉ vai trò xem giá vốn mở được bảng và tệp
 * báo giá (người duyệt đề nghị đều thuộc nhóm đó).
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/mh-dot4-so-gia.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface BoardQuote {
  quotation_id: string;
  supplier_id: string;
  status: string;
  landed_total: number;
  cost_rank: number | null;
  missing_items: number;
  has_vat_invoice: boolean | null;
  notes: string | null;
  document_path: string | null;
}
interface BoardLine {
  request_item_id: string;
  prices: Record<string, number>;
  last_purchase: { unit_price: number; supplier_name: string } | null;
}
interface Board {
  quotations: BoardQuote[];
  lines: BoardLine[];
}

interface Fixture {
  request: string;
  closedRequest: string;
  itemCement: string;
  itemSand: string;
  supplierA: string;
  supplierB: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date)
      VALUES (${nvo!.id}, ${'NVO-CT-SOGIA-' + stamp}, ${TEST_PREFIX + ' So giá ' + stamp}, 'dang_thi_cong', current_date + 90)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${site!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvo}`;
    const suppliers = await sql<{ id: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class)
      VALUES (${'NCC-SG-A-' + stamp}, ${TEST_PREFIX + ' NCC A ' + stamp}, 'chinh'),
             (${'NCC-SG-B-' + stamp}, ${TEST_PREFIX + ' NCC B ' + stamp}, 'du_phong')
      RETURNING id`;
    const cementCode = `XM-SG-${stamp}`;

    async function request(stage: string, label: string): Promise<string> {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, construction_site_id, stage, needed_date, cost_code)
        VALUES (${nvo!.id}, ${'PR-SG-' + label + '-' + stamp}, ${TEST_PREFIX + ' So giá ' + label + ' ' + stamp},
                ${site!.id}, ${stage}::purchase_request_stage, current_date + 5, 'VT-SG')
        RETURNING id`;
      return row!.id;
    }
    const req = await request('nhap', 'MOI');
    const [cement] = await sql<{ id: string }[]>`
      INSERT INTO purchase_request_items (purchase_request_id, position, item_code, name, unit, quantity, estimated_unit_price)
      VALUES (${req}, 1, ${cementCode}, 'Xi măng PCB40', 'tấn', 10, 1500000) RETURNING id`;
    const [sand] = await sql<{ id: string }[]>`
      INSERT INTO purchase_request_items (purchase_request_id, position, item_code, name, unit, quantity, estimated_unit_price)
      VALUES (${req}, 2, ${'CAT-SG-' + stamp}, 'Cát vàng', 'm3', 20, 400000) RETURNING id`;

    // Lần mua trước của cùng mã xi măng: đơn hàng đã giao ở một đề nghị khác.
    const closed = await request('hoan_thanh', 'CU');
    const [oldOrder] = await sql<{ id: string }[]>`
      INSERT INTO purchase_orders (company_id, code, purchase_request_id, supplier_id, stage, order_date, total_value)
      VALUES (${nvo!.id}, ${'DH-SG-' + stamp}, ${closed}, ${suppliers[1]!.id}, 'da_giao_du', current_date - 10, 13000000)
      RETURNING id`;
    await sql`
      INSERT INTO purchase_order_items (purchase_order_id, position, item_code, name, unit, quantity, unit_price, delivered_quantity)
      VALUES (${oldOrder!.id}, 1, ${cementCode}, 'Xi măng PCB40', 'tấn', 10, 1300000, 10)`;

    return {
      request: req,
      closedRequest: closed,
      itemCement: cement!.id,
      itemSand: sand!.id,
      supplierA: suppliers[0]!.id,
      supplierB: suppliers[1]!.id,
    };
  } finally {
    await sql.end();
  }
}

async function board(client: SupabaseClient, requestId: string): Promise<Board> {
  const { data, error } = await client.rpc('quotation_board', { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data as Board;
}

describeDb('4B — bảng so giá nhà cung cấp (0201)', () => {
  let f: Fixture;
  let muaHang: SupabaseClient;

  beforeAll(async () => {
    f = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
  });

  it('nhập báo giá khi đề nghị còn Nháp: đủ dòng thì «Đã nhận», ghi VAT, vận chuyển, ghi chú', async () => {
    const { error: upErr } = await muaHang.storage
      .from('quotation-files')
      .upload(
        `${f.request}/bao-gia-a.pdf`,
        new Blob(['%PDF-1.4 thu'], { type: 'application/pdf' }),
        {
          contentType: 'application/pdf',
        },
      );
    expect(upErr).toBeNull();

    const { error } = await muaHang.rpc('save_quotation', {
      p_request_id: f.request,
      p_supplier_id: f.supplierA,
      p_header: {
        quoted_date: new Date().toISOString().slice(0, 10),
        tax_rate_bp: 1000,
        shipping_fee: 500000,
        delivery_days: 2,
        has_vat_invoice: true,
        notes: 'Giao tận chân công trình',
        document_path: `${f.request}/bao-gia-a.pdf`,
      },
      p_prices: { [f.itemCement]: 1_450_000, [f.itemSand]: 380_000 },
    });
    expect(error).toBeNull();

    // B chỉ báo xi măng, rẻ hơn — nhưng thiếu cát.
    const { error: errB } = await muaHang.rpc('save_quotation', {
      p_request_id: f.request,
      p_supplier_id: f.supplierB,
      p_header: { has_vat_invoice: false },
      p_prices: { [f.itemCement]: 1_350_000, [f.itemSand]: null },
    });
    expect(errB).toBeNull();
  });

  it('bảng đặt cạnh nhau: chỉ báo giá đủ mặt hàng được xếp hạng, có giá lần mua trước', async () => {
    const b = await board(muaHang, f.request);
    const a = b.quotations.find((q) => q.supplier_id === f.supplierA)!;
    const bq = b.quotations.find((q) => q.supplier_id === f.supplierB)!;
    expect(a.status).toBe('da_nhan');
    expect(a.has_vat_invoice).toBe(true);
    expect(a.notes).toBe('Giao tận chân công trình');
    expect(a.cost_rank).toBe(1);
    expect(a.missing_items).toBe(0);
    // (14.500.000 + 7.600.000) × 1,1 + 500.000
    expect(Number(a.landed_total)).toBe(24_810_000);
    expect(bq.missing_items).toBe(1);
    expect(bq.cost_rank).toBeNull();
    expect(bq.has_vat_invoice).toBe(false);

    const cement = b.lines.find((l) => l.request_item_id === f.itemCement)!;
    expect(Number(cement.prices[a.quotation_id])).toBe(1_450_000);
    expect(Number(cement.prices[bq.quotation_id])).toBe(1_350_000);
    expect(Number(cement.last_purchase!.unit_price)).toBe(1_300_000);
    const sand = b.lines.find((l) => l.request_item_id === f.itemSand)!;
    expect(sand.last_purchase).toBeNull();
  });

  it('tệp báo giá phải nằm trong thư mục của chính đề nghị', async () => {
    const { error } = await muaHang.rpc('save_quotation', {
      p_request_id: f.request,
      p_supplier_id: f.supplierA,
      p_header: { document_path: `${f.closedRequest}/khac.pdf` },
      p_prices: {},
    });
    expect(error?.message).toMatch(/không thuộc đề nghị mua này/);
  });

  it('đề nghị đã hoàn thành không nhận tệp báo giá mới', async () => {
    const { error } = await muaHang.storage
      .from('quotation-files')
      .upload(`${f.closedRequest}/muon.pdf`, new Blob(['%PDF'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(error).toBeTruthy();
  });

  it('chỉ huy trưởng không mở được bảng so giá (NEN-07)', async () => {
    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    const { error } = await cht.rpc('quotation_board', { p_request_id: f.request });
    expect(error?.message).toMatch(/chỉ mở cho/);
  });

  it('chỉ huy trưởng không tải được tệp báo giá (NEN-07)', async () => {
    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    const { data } = await cht.storage
      .from('quotation-files')
      .download(`${f.request}/bao-gia-a.pdf`);
    expect(data).toBeNull();
  });

  it('Tổng Giám đốc (người duyệt) mở được bảng và tệp', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const b = await board(tgd, f.request);
    expect(b.quotations).toHaveLength(2);
    const { data } = await tgd.storage
      .from('quotation-files')
      .download(`${f.request}/bao-gia-a.pdf`);
    expect(data).not.toBeNull();
  });

  it('đã chọn nhà cung cấp thì báo giá không sửa được nữa', async () => {
    const b = await board(muaHang, f.request);
    const a = b.quotations.find((q) => q.supplier_id === f.supplierA)!;
    const { error: selErr } = await muaHang.rpc('select_quotation', {
      p_quotation_id: a.quotation_id,
      p_reason: null,
    });
    expect(selErr).toBeNull();
    const { error } = await muaHang.rpc('save_quotation', {
      p_request_id: f.request,
      p_supplier_id: f.supplierA,
      p_header: {},
      p_prices: { [f.itemCement]: 1 },
    });
    expect(error?.message).toMatch(/đã chọn nhà cung cấp/);
  });
});
