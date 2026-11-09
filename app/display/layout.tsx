import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '週間カロリー収支 | 健康管理',
  description: '常駐ディスプレイ向け週間カロリー収支（Echo Show 5: 960×480）',
}

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
