/**
 * Chụp ảnh màn hình cho hướng dẫn Kinh doanh / Dự án – Đấu thầu (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Chuyển bước — chỉ
 * mở màn hình và biểu mẫu.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-kinh-doanh.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/kd';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string, { keepHelp = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Trang tải phần mã theo lượt (lazy): networkidle tới trước khi trang kịp vẽ tiêu đề.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (!keepHelp && (await gotIt.isVisible())) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

test('Kinh doanh', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'kinhdoanh.nvc@nhavietgroup.test');
  await page.goto('/dashboard');
  await shot(page, '01-dashboard');

  await page.goto('/crm/co-hoi');
  await shot(page, '02-pheu-co-hoi');
  await page.goto('/crm/co-hoi/tao-moi');
  await shot(page, '03-tao-co-hoi');

  await page.goto('/crm/co-hoi');
  await page
    .getByRole('link', { name: /Nhà xưởng sản xuất linh kiện/ })
    .first()
    .click();
  await page.waitForURL(/crm\/co-hoi\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: /Nhà xưởng sản xuất linh kiện/ })).toBeVisible();
  const opp = page.url().split('?')[0]!;
  await shot(page, '04-co-hoi-tong-quan');
  await page.goto(`${opp}?tab=khao-sat`);
  await shot(page, '05-khao-sat');
  await page.goto(`${opp}?tab=bao-gia`);
  await shot(page, '06-bao-gia');

  await page.goto('/crm/khach-hang');
  await shot(page, '07-khach-hang');
  await page
    .getByRole('link', { name: /Hưng Thịnh/ })
    .first()
    .click();
  await page.waitForURL(/crm\/khach-hang\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: /Hưng Thịnh/ })).toBeVisible();
  await shot(page, '08-ho-so-khach-hang');

  await page.goto('/crm/khieu-nai');
  await shot(page, '09-khieu-nai');
});

test('Dự án – Đấu thầu', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'dauthau.nvc@nhavietgroup.test');

  await page.goto('/da/goi-thau');
  await shot(page, '10-goi-thau');
  await page
    .getByRole('link', { name: /Hưng Thịnh/ })
    .first()
    .click();
  await page.waitForURL(/da\/goi-thau\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: /Gói thầu thi công/ })).toBeVisible();
  const bid = page.url().split('?')[0]!;
  await shot(page, '11-goi-thau-tong-quan');
  for (const [tab, name] of [
    ['khoi-luong', '12-khoi-luong'],
    ['du-toan', '13-du-toan'],
    ['ho-so-thau', '14-ho-so-thau'],
    ['ngan-sach', '15-ngan-sach'],
  ] as const) {
    await page.goto(`${bid}?tab=${tab}`);
    await shot(page, name);
  }

  await page.goto('/da/don-gia');
  await shot(page, '16-don-gia');

  await page.goto('/hd/hop-dong');
  await shot(page, '17-hop-dong');
  await page
    .getByRole('link', { name: /Hưng Thịnh/ })
    .first()
    .click();
  await page.waitForURL(/hd\/hop-dong\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: /Hợp đồng thi công nhà xưởng/ })).toBeVisible();
  const contract = page.url().split('?')[0]!;
  await shot(page, '18-hop-dong-tong-quan');
  await page.goto(`${contract}?tab=dieu-khoan`);
  await shot(page, '19-dieu-khoan');
  await page.goto(`${contract}?tab=phat-sinh`);
  await shot(page, '20-phat-sinh');
});
