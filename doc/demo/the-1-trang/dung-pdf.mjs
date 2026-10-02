/**
 * Dựng PDF (và ảnh xem trước) cho thẻ thao tác một trang.
 *
 *   node doc/demo/the-1-trang/dung-pdf.mjs 01_CHI_HUY_TRUONG.html [...]
 *
 * Dùng Chromium của Playwright đã có trong kho. Báo lỗi nếu nội dung tràn quá một trang A4.
 */
import { chromium } from '@playwright/test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Thiếu tên tệp HTML.');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
let failed = false;
for (const file of files) {
  const src = resolve(here, file);
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Đo cả chồng lấn: một khối co lại (flex) thì trang không cao thêm mà chữ đè lên ảnh.
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.page');
    if (!el) return 0;
    let worst = el.scrollHeight - el.clientHeight;
    for (const block of el.querySelectorAll('.main, .grid, .bottom, footer, aside')) {
      const over = block.scrollHeight - block.clientHeight;
      if (over > worst) worst = over;
    }
    const blocks = [...el.children];
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].getBoundingClientRect().top - blocks[i - 1].getBoundingClientRect().bottom;
      if (-gap > worst) worst = -gap;
    }
    return Math.round(worst);
  });
  if (overflow > 1) {
    console.error(`${file}: tràn ${overflow}px quá một trang A4.`);
    failed = true;
  }
  const out = src.replace(/\.html$/, '');
  await page.pdf({ path: `${out}.pdf`, format: 'A4', printBackground: true, pageRanges: '1' });
  await page.screenshot({ path: join(here, 'xem-truoc', `${file.replace(/\.html$/, '')}.png`), fullPage: false });
  console.log(`Đã ghi ${out}.pdf`);
}
await browser.close();
process.exit(failed ? 1 : 0);
