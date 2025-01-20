/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://deepseek-playground.vercel.app",
  generateRobotsTxt: true,
  // ↓ `outDir` は任意 (デフォルトは `.next/` なので
  //   公開フォルダに入れたい場合は public等に指定する
  outDir: "public",
  // ほか設定は必要に応じて
};
