import type { Metadata } from 'next'
import LegalPage, { H2, Contact } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | 健康収支トラッカー',
  description: '健康収支トラッカーが取り扱うデータとその利用目的について',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" updated="2026年10月5日">
      <p>
        「健康収支トラッカー」（以下「本アプリ」）は、個人のカロリー収支・体重管理を支援するアプリです。
        本ポリシーは、本アプリが取り扱うデータとその利用目的を説明します。
      </p>

      <H2>1. 取得するデータ</H2>
      <ul style={{ paddingLeft: 20 }}>
        <li>Google アカウント情報（メールアドレス・ユーザーID）: ログインと利用者の識別に使用します（Firebase Authentication）。</li>
        <li>
          Google Health API から取得する健康データ（読み取り専用）: 歩数、消費カロリー、心拍数、睡眠時間、体重、体脂肪率。
          利用者が同意した場合にのみ取得します。
        </li>
        <li>FatSecret から取得する食事記録（摂取カロリー、PFC、食品名）: 利用者が連携した場合のみ。</li>
        <li>利用者が本アプリ内で設定する目標体重・目標日・アドバイザーの設定。</li>
      </ul>

      <H2>2. 利用目的</H2>
      <p>
        取得したデータは、カロリー収支の算出・体重推移の予測・グラフ表示・AI による週次／随時のアドバイス生成という、
        利用者本人に提供する機能のためにのみ使用します。広告、第三者への販売、プロファイリング目的では使用しません。
      </p>

      <H2>3. Google ユーザーデータの取り扱い（Limited Use）</H2>
      <p>
        本アプリによる Google API から受け取った情報の使用および他アプリへの移転は、
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: '#175C49' }}>
          Google API サービスのユーザーデータに関するポリシー
        </a>
        （Limited Use の要件を含む）に準拠します。具体的には次のとおりです。
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li>Google の健康データは、利用者に表示される機能の提供・改善のためにのみ使用します。</li>
        <li>法令遵守、セキュリティ上の目的、または利用者の同意がある場合を除き、第三者に提供・移転しません。</li>
        <li>広告配信（パーソナライズ広告を含む）には使用しません。</li>
        <li>人間が閲覧することはありません（利用者本人の同意、セキュリティ調査、法令遵守のための場合を除く）。</li>
      </ul>

      <H2>4. 保存と保護</H2>
      <p>
        データは、利用者ごとに分離してデータベース（Neon / PostgreSQL）に保存します。Google 等の連携トークンは暗号化して保存し、
        通信は HTTPS で保護します。本アプリは利用を許可されたアカウントのみが利用できます。
      </p>

      <H2>5. 外部サービスへの送信</H2>
      <ul style={{ paddingLeft: 20 }}>
        <li>認証: Google / Firebase Authentication</li>
        <li>ホスティング: Vercel</li>
        <li>データベース: Neon</li>
        <li>
          AI アドバイス生成: Groq。アドバイス生成のため、日別の体重・摂取・消費・歩数などの集計値を送信します。
          メールアドレス等の個人を直接特定する情報は送信しません。
        </li>
      </ul>

      <H2>6. 連携の解除とデータの削除</H2>
      <p>
        Google 連携は、<a href="https://myaccount.google.com/permissions" style={{ color: '#175C49' }}>Google アカウントの権限設定</a>
        からいつでも解除できます。本アプリに保存されたデータの削除をご希望の場合は、下記までご連絡ください。
        合理的な期間内に削除します。
      </p>

      <H2>7. 改定</H2>
      <p>本ポリシーを変更する場合は、本ページで告知します。</p>

      <H2>8. お問い合わせ</H2>
      <Contact />
    </LegalPage>
  )
}
