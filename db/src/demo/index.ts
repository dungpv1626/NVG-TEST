/**
 * Nạp dữ liệu demo — `npm run db:demo-data` (Supabase tại máy) · `npm run db:demo-data:demo`
 * (bản chạy thử / demo trên cloud, bắt buộc kèm `--confirm=<mã project>`).
 *
 * Chỉ CỘNG THÊM, không xoá: kịch bản nào đã có (nhận ra bằng tên hồ sơ gốc) thì bỏ qua. Muốn
 * làm lại từ đầu trên máy: `npx supabase db reset` → `npm run db:migrate && npm run db:seed`.
 * Không có lệnh xoá cho bản demo — cố ý.
 *
 * Mọi lượt ghi đi qua đúng hàm nghiệp vụ, bằng đúng tài khoản seed của vai trò đó.
 */

import { DB_TARGET, DEMO_PROJECT_REF } from '../env';
import { loadNvc } from './scenario-nvc';
import { loadNvs } from './scenario-nvs';

const SCENARIOS = {
  nvc: { label: 'NVC — nhà xưởng, cơ hội tới lãi/lỗ, một ngày công trường', run: loadNvc },
  nvs: { label: 'NVS — cho thuê giàn giáo', run: loadNvs },
} as const;

type ScenarioKey = keyof typeof SCENARIOS;

async function main() {
  const args = process.argv.slice(2);
  const only = args
    .find((a) => a.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',') as ScenarioKey[] | undefined;

  const host = new URL(process.env.SUPABASE_URL ?? 'http://khong-ro').host;
  console.log(
    `Đích: ${DB_TARGET === 'demo' ? 'BẢN DEMO trên cloud' : 'Supabase tại máy'} (${host})`,
  );

  if (DB_TARGET === 'demo' && !args.includes(`--confirm=${DEMO_PROJECT_REF}`)) {
    throw new Error(
      `Nạp lên bản demo phải xác nhận tường minh: thêm --confirm=${DEMO_PROJECT_REF}. Diễn tập trên máy trước.`,
    );
  }

  for (const [key, scenario] of Object.entries(SCENARIOS) as [
    ScenarioKey,
    (typeof SCENARIOS)[ScenarioKey],
  ][]) {
    if (only && !only.includes(key)) continue;
    const started = Date.now();
    const result = await scenario.run();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `${result === 'created' ? 'Đã nạp ' : 'Bỏ qua  '} ${scenario.label} (${seconds} giây)`,
    );
  }
}

main().catch((error) => {
  console.error('Nạp dữ liệu demo thất bại:', error instanceof Error ? error.message : error);
  process.exit(1);
});
