/**
 * Khai báo kiểu cho `import ... from '<tệp>.yaml'`.
 *
 * `wrangler.jsonc` khai `rules` kiểu `Text` cho các tệp `.yaml`, nên esbuild nhúng nội dung
 * tệp thành một chuỗi. TypeScript không biết điều đó nếu không có khai báo này.
 */
declare module '*.yaml' {
  const content: string;
  export default content;
}
