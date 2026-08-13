// ===== ルート（/）=====
// 外部総合品質監査レポートM-02対応（2026-08-14）：Next.jsの初期テンプレートがそのまま
// 本番公開されており、「To get started, edit the page.tsx file.」という文言とVercel/Next.js
// への外部リンクが表示されていた。このアプリのルートは常に社内向けログイン画面へ
// リダイレクトするだけでよいため、redirect()に置き換える。
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
