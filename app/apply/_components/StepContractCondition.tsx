'use client'

// STEP6（A=STEP4 / C=STEP6）：契約条件（締結パターン・賞与・備考欄プレビュー）
// app/apply/page.tsx の stepType === 'contractCondition' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetterをpropsで受け取る。

import { useState } from 'react'
import { CLOSING_PATTERNS, needsBonusSelection } from '../_lib/helpers'
import { FormRow, SectionHeader } from './FormParts'

interface StepContractConditionProps {
  pattern: string
  contractType: string

  closingPattern: string
  setClosingPattern: (v: string) => void

  bonusType: 'あり' | 'なし' | ''
  setBonusType: (v: 'あり' | 'なし' | '') => void

  remarksText: string

  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void; error?: string | null }>
}

export default function StepContractCondition({
  pattern, contractType,
  closingPattern, setClosingPattern,
  bonusType, setBonusType,
  remarksText,
  handleNext, NavButtons,
}: StepContractConditionProps) {
  // 2026-07-22追加（alert/confirm置き換えPhase3・①必須項目チェック）：NavButtonsのerror propに
  // 渡すためのローカルstate。従来alert()表示していたエラーメッセージをバナー化する。
  const [stepError, setStepError] = useState<string | null>(null)
  return (
    <>
      <SectionHeader label="締結パターン" />
      <FormRow label="締結パターン" required>
        <div className="grid grid-cols-3 gap-3">
          {CLOSING_PATTERNS.map(p => (
            <button key={p.id}
              onClick={e => { e.preventDefault(); setClosingPattern(p.id) }}
              className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all text-center"
              style={{
                borderColor: closingPattern === p.id ? '#1B3A8C' : '#D0DAF0',
                background: closingPattern === p.id ? '#EEF2FA' : 'white',
              }}>
              <img src={p.icon} alt={p.label} className="w-20 h-20 object-contain" />
              <p className="text-xs font-bold" style={{ color: '#1B3A8C' }}>{p.label}</p>
              <p className="text-xs leading-snug" style={{ color: '#5A6A8A' }}>{p.desc}</p>
            </button>
          ))}
        </div>
      </FormRow>

      <SectionHeader label="備考文言" />

      {needsBonusSelection(pattern, contractType) ? (
        <FormRow label="賞与" required>
          <div className="flex gap-3">
            {(['あり', 'なし'] as const).map(v => (
              <button key={v}
                onClick={e => { e.preventDefault(); setBonusType(v) }}
                className="flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all"
                style={{
                  borderColor: bonusType === v ? '#1B3A8C' : '#D0DAF0',
                  background: bonusType === v ? '#EEF2FA' : 'white',
                  color: bonusType === v ? '#1B3A8C' : '#5A6A8A',
                }}>
                賞与{v}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
            賞与（ボーナス）が契約上支給される場合は「賞与あり」。決算賞与のみで契約書上に記載が不要な場合は「賞与なし」を選んでください。
          </p>
        </FormRow>
      ) : (
        <FormRow label="賞与">
          <p className="text-xs rounded-lg px-3 py-2 inline-block border"
            style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
            自動確定（選択不要）
          </p>
        </FormRow>
      )}

      {pattern !== 'B' && (
        <FormRow label="備考欄プレビュー">
          <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（自動生成）</p>
            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>
              {remarksText}
            </p>
          </div>
        </FormRow>
      )}

      <NavButtons onNext={() => {
        if (!closingPattern) { setStepError('締結パターンを選択してください'); return }
        if (needsBonusSelection(pattern, contractType) && !bonusType) { setStepError('賞与の有無を選択してください'); return }
        setStepError(null)
        handleNext()
      }} error={stepError} />
    </>
  )
}
