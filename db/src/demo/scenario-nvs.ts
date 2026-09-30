/**
 * Kịch bản NVS — cho thuê giàn giáo (luồng M2-2, phần đã dựng).
 *
 * Chuỗi lệnh chép từ `__tests__/sx.test.ts`. Dừng ở hai trạng thái đáng xem: một hợp đồng đã
 * thu hồi một phần (doanh thu tính theo ngày thuê thật của từng đợt), một hợp đồng đang thuê.
 * Lô giàn giáo ghi qua PostgREST bằng vai trò Kho — đúng đường màn hình Giàn giáo đi.
 */

import { ACCOUNTS, check, companyId, day, one, signIn } from './client';
import { clean } from './names';

/**
 * Mã lô do trình nạp đặt. Lệnh gỡ nhận lô của trình nạp bằng ĐÚNG mã này (và các lô tách ra
 * từ nó, mang mã gốc làm tiền tố) — KHÔNG bằng tiền tố chung `NVS-GIANGIAO-`, vì lô người dùng
 * nhập tay cũng mang tiền tố đó (sự cố 30/09/2026: gỡ nhầm ba lô có sẵn, đã khôi phục).
 */
export function demoLotCode(materialCode: string): string {
  return `NVS-${materialCode}-L2609`;
}

export const NVS_FIRST_RENTAL_CUSTOMER = clean('Công ty CP Xây dựng Đông Đô');

const MATERIALS = [
  {
    code: 'GIANGIAO-NEM-150',
    name: 'Giáo nêm Φ49 cao 1,5 m',
    spec: 'Ống Φ49 dày 2,0 mm, mạ kẽm',
    lot: 1_200,
    rate: 1_800,
  },
  {
    code: 'GIANGIAO-MAMSAN-1200',
    name: 'Mâm sàn thao tác 1,2 m',
    spec: 'Thép tấm dập chống trượt',
    lot: 600,
    rate: 1_500,
  },
  {
    code: 'GIANGIAO-KICH-U600',
    name: 'Kích chữ U 600',
    spec: 'Ren Φ34, hành trình 400 mm',
    lot: 800,
    rate: 600,
  },
] as const;

/** Vật tư mà trình nạp đặt lô — lệnh gỡ dựng mã lô từ đây. */
export const DEMO_LOT_MATERIALS: readonly string[] = MATERIALS.map((m) => m.code);

export async function loadNvs(): Promise<'created' | 'skipped'> {
  const kho = await signIn(ACCOUNTS.kho);
  const already = await kho
    .from('customers')
    .select('id')
    .eq('name', NVS_FIRST_RENTAL_CUSTOMER)
    .maybeSingle();
  if (already.data) return 'skipped';

  const kinhDoanh = await signIn(ACCOUNTS.kinhDoanhNvc);
  const nvs = await companyId(kho, 'NVS');

  // Danh mục vật tư giàn giáo (KHO-02, mã theo Catalogue NVS) và lô tồn tại kho xưởng.
  const materialIds = new Map<string, string>();
  for (const m of MATERIALS) {
    const found = await kho.from('materials').select('id').eq('code', m.code).maybeSingle();
    const id =
      (found.data as { id: string } | null)?.id ??
      (
        (await one(
          `lập vật tư ${m.code}`,
          kho
            .from('materials')
            .insert({
              code: m.code,
              group_code: 'GIANGIAO',
              name: clean(m.name),
              specification: clean(m.spec),
              unit: 'bộ',
              is_scaffolding: true,
            })
            .select('id')
            .single(),
        )) as { id: string }
      ).id;
    materialIds.set(m.code, id);
    check(
      `nhập lô ${m.code}`,
      await kho.from('scaffolding_assets').insert({
        company_id: nvs,
        asset_code: demoLotCode(m.code),
        material_id: id,
        quantity: m.lot,
        condition: 'con_dung_duoc',
        location_type: 'kho',
        purchase_date: day(-200),
      }),
    );
  }

  // Hai khách thuê.
  const customers: string[] = [];
  for (const c of [
    {
      name: NVS_FIRST_RENTAL_CUSTOMER,
      contact: 'Bà Lê Thu Hà — phòng vật tư',
      phone: '0983 225 610',
    },
    {
      name: 'Công ty TNHH Đầu tư Xây dựng Thành An',
      contact: 'Ông Trịnh Văn Tuấn — chỉ huy trưởng',
      phone: '0904 551 238',
    },
  ]) {
    const row = (await one(
      'lập khách thuê',
      kinhDoanh
        .from('customers')
        .insert({
          name: clean(c.name),
          source: 'Giới thiệu',
          contact_person: clean(c.contact),
          phone: c.phone,
        })
        .select('id')
        .single(),
    )) as { id: string };
    customers.push(row.id);
  }

  const giao = materialIds.get('GIANGIAO-NEM-150')!;
  const mam = materialIds.get('GIANGIAO-MAMSAN-1200')!;
  const kich = materialIds.get('GIANGIAO-KICH-U600')!;

  // Hợp đồng 1: thuê từ 20 ngày trước, đã trả bớt một phần 3 ngày trước.
  const rental1 = check(
    'lập hợp đồng thuê 1',
    await kho.rpc('create_rental_agreement', {
      p_company_id: nvs,
      p_customer_id: customers[0],
      p_construction_site_id: null,
      p_site_address: clean('Tòa văn phòng 9 tầng, 88 Trần Duy Hưng, Cầu Giấy, Hà Nội'),
      p_start_date: day(-20),
      p_expected_end_date: day(40),
      p_deposit_amount: 50_000_000,
      p_notes: clean('Giao tại chân công trình, khách tự bốc xếp'),
      p_items: [
        { material_id: giao, quantity: 400, daily_rate: 1_800 },
        { material_id: mam, quantity: 200, daily_rate: 1_500 },
        { material_id: kich, quantity: 300, daily_rate: 600 },
      ],
    }),
  ) as string;
  check(
    'thu hồi một phần hợp đồng 1',
    await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: rental1,
      p_actual_return_date: day(-3),
      p_items: [
        {
          material_id: giao,
          quantity_ok: 150,
          quantity_damaged: 4,
          quantity_lost: 0,
          compensation_amount: 0,
        },
        {
          material_id: mam,
          quantity_ok: 80,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    }),
  );

  // Hợp đồng 2: đang thuê.
  check(
    'lập hợp đồng thuê 2',
    await kho.rpc('create_rental_agreement', {
      p_company_id: nvs,
      p_customer_id: customers[1],
      p_construction_site_id: null,
      p_site_address: clean('Chung cư 15 tầng, lô CT2, Khu đô thị Thanh Hà, Hà Đông'),
      p_start_date: day(-8),
      p_expected_end_date: day(52),
      p_deposit_amount: 30_000_000,
      p_notes: null,
      p_items: [
        { material_id: giao, quantity: 350, daily_rate: 1_800 },
        { material_id: kich, quantity: 200, daily_rate: 600 },
      ],
    }),
  );

  return 'created';
}
