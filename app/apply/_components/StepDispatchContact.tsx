'use client'

// STEP3：派遣先担当者（指揮命令者・派遣先責任者・苦情処理申出先（派遣先）・追加項目）
// app/apply/page.tsx の stepType === 'dispatchContact' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetterをpropsで受け取る。

import { inp, deptInputStyle, validateTel, DEFAULT_SAFETY, DEFAULT_CONFLICT } from '../_lib/helpers'
import { FormRow, SectionHeader, TelInput, NoBreakTextarea, ModeToggle } from './FormParts'

interface StepDispatchContactProps {
  showEmptyHint: boolean
  CsvBadge: React.ComponentType<{ name: string }>

  cmd_dept: string; cmd_role: string; cmd_name: string; cmd_tel: string
  setCmdDept: (v: string) => void; setCmdRole: (v: string) => void; setCmdName: (v: string) => void; setCmdTel: (v: string) => void

  resp_dept: string; resp_role: string; resp_name: string; resp_tel: string
  setRespDept: (v: string) => void; setRespRole: (v: string) => void; setRespName: (v: string) => void; setRespTel: (v: string) => void

  comp_dept: string; comp_role: string; comp_name: string; comp_tel: string
  setCompDept: (v: string) => void; setCompRole: (v: string) => void; setCompName: (v: string) => void; setCompTel: (v: string) => void

  welfare: string; setWelfare: (v: string) => void
  safetyMode: 'default' | 'new'; setSafetyMode: (m: 'default' | 'new') => void
  safetyText: string; setSafetyText: (v: string) => void
  conflictMode: 'default' | 'new'; setConflictMode: (m: 'default' | 'new') => void
  conflictText: string; setConflictText: (v: string) => void
  csvBadges: Record<string, 'none' | 'reflected' | 'modified'>
  setCsvBadge: (key: string, state: 'reflected' | 'modified') => void

  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void }>
}

export default function StepDispatchContact({
  showEmptyHint, CsvBadge,
  cmd_dept, cmd_role, cmd_name, cmd_tel, setCmdDept, setCmdRole, setCmdName, setCmdTel,
  resp_dept, resp_role, resp_name, resp_tel, setRespDept, setRespRole, setRespName, setRespTel,
  comp_dept, comp_role, comp_name, comp_tel, setCompDept, setCompRole, setCompName, setCompTel,
  welfare, setWelfare,
  safetyMode, setSafetyMode, safetyText, setSafetyText,
  conflictMode, setConflictMode, conflictText, setConflictText,
  csvBadges, setCsvBadge,
  handleNext, NavButtons,
}: StepDispatchContactProps) {
  return (
    <>
      <SectionHeader label="指揮命令者" />
      <FormRow label="部署名" required badge={<CsvBadge name="cmdDept" />} wide
        isEmpty={showEmptyHint && !cmd_dept} emptyHint="入力してください">
        <input className={inp} style={deptInputStyle} value={cmd_dept} onChange={e => { setCmdDept(e.target.value) }}
          placeholder="例）東日本ｴﾘｱ営業本部 関東営業統括部 第3営業部" />
      </FormRow>
      <FormRow label="役職" required badge={<CsvBadge name="cmdRole" />}
        isEmpty={showEmptyHint && !cmd_role} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={cmd_role} onChange={e => { setCmdRole(e.target.value) }} placeholder="例）課長" />
      </FormRow>
      <FormRow label="氏名" required badge={<CsvBadge name="cmdName" />}
        isEmpty={showEmptyHint && !cmd_name} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={cmd_name} onChange={e => { setCmdName(e.target.value) }} placeholder="例）山田 太郎" />
      </FormRow>
      <FormRow label="電話番号" required badge={<CsvBadge name="cmdTel" />}
        isEmpty={showEmptyHint && !cmd_tel} emptyHint="入力してください">
        <TelInput value={cmd_tel} onChange={v => { setCmdTel(v) }} />
      </FormRow>

      <SectionHeader label="派遣先責任者" />
      <FormRow label="部署名" required badge={<CsvBadge name="respDept" />} wide
        isEmpty={showEmptyHint && !resp_dept} emptyHint="入力してください">
        <input className={inp} style={deptInputStyle} value={resp_dept} onChange={e => { setRespDept(e.target.value) }} placeholder="例）人事部" />
      </FormRow>
      <FormRow label="役職" required badge={<CsvBadge name="respRole" />}
        isEmpty={showEmptyHint && !resp_role} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={resp_role} onChange={e => { setRespRole(e.target.value) }} placeholder="例）部長" />
      </FormRow>
      <FormRow label="氏名" required badge={<CsvBadge name="respName" />}
        isEmpty={showEmptyHint && !resp_name} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={resp_name} onChange={e => { setRespName(e.target.value) }} placeholder="例）鈴木 花子" />
      </FormRow>
      <FormRow label="電話番号" required badge={<CsvBadge name="respTel" />}
        isEmpty={showEmptyHint && !resp_tel} emptyHint="入力してください">
        <TelInput value={resp_tel} onChange={v => { setRespTel(v) }} />
      </FormRow>

      <SectionHeader label="苦情処理申出先（派遣先）" />
      <FormRow label="部署名" required badge={<CsvBadge name="compDept" />} wide
        isEmpty={showEmptyHint && !comp_dept} emptyHint="入力してください">
        <input className={inp} style={deptInputStyle} value={comp_dept} onChange={e => { setCompDept(e.target.value) }} placeholder="例）総務部" />
      </FormRow>
      <FormRow label="役職" required badge={<CsvBadge name="compRole" />}
        isEmpty={showEmptyHint && !comp_role} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={comp_role} onChange={e => { setCompRole(e.target.value) }} placeholder="例）担当者" />
      </FormRow>
      <FormRow label="氏名" required badge={<CsvBadge name="compName" />}
        isEmpty={showEmptyHint && !comp_name} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          value={comp_name} onChange={e => { setCompName(e.target.value) }} placeholder="例）田中 次郎" />
      </FormRow>
      <FormRow label="電話番号" required badge={<CsvBadge name="compTel" />}
        isEmpty={showEmptyHint && !comp_tel} emptyHint="入力してください">
        <TelInput value={comp_tel} onChange={v => { setCompTel(v) }} />
      </FormRow>

      <SectionHeader label="追加項目" />
      <FormRow label="福利厚生施設の利用等" required badge={<CsvBadge name="welfare" />} wide
        isEmpty={showEmptyHint && !welfare} emptyHint="入力してください">
        <NoBreakTextarea value={welfare} onChange={v => { setWelfare(v) }} placeholder="例）社員食堂・更衣室の利用可" minHeight="60px" />
      </FormRow>
      <FormRow label="安全及び衛生" required badge={<CsvBadge name="safety" />}>
        <ModeToggle mode={safetyMode} onChange={m => { setSafetyMode(m); setSafetyText(m === 'default' ? DEFAULT_SAFETY : '') }} />
        <NoBreakTextarea value={safetyText} onChange={v => { setSafetyText(v); if (csvBadges['safety'] === 'reflected') setCsvBadge('safety', 'modified') }}
          placeholder="安全及び衛生に関する内容を入力してください" minHeight="80px"
          bg={safetyMode === 'default' ? '#F5F7FC' : 'white'} />
        <p className="text-xs" style={{ color: '#5A6A8A' }}>
          {safetyMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
        </p>
      </FormRow>
      <FormRow label="紛争防止措置" required badge={<CsvBadge name="conflict2" />}>
        <ModeToggle mode={conflictMode} onChange={m => { setConflictMode(m); setConflictText(m === 'default' ? DEFAULT_CONFLICT : '') }} />
        <NoBreakTextarea value={conflictText} onChange={v => { setConflictText(v); if (csvBadges['conflict2'] === 'reflected') setCsvBadge('conflict2', 'modified') }}
          placeholder="紛争防止措置に関する内容を入力してください" minHeight="80px"
          bg={conflictMode === 'default' ? '#F5F7FC' : 'white'} />
        <p className="text-xs" style={{ color: '#5A6A8A' }}>
          {conflictMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
        </p>
      </FormRow>

      <NavButtons onNext={() => {
        if (!cmd_dept || !cmd_role || !cmd_name || !cmd_tel) { alert('指揮命令者の全項目を入力してください'); return }
        if (!resp_dept || !resp_role || !resp_name || !resp_tel) { alert('派遣先責任者の全項目を入力してください'); return }
        if (!comp_dept || !comp_role || !comp_name || !comp_tel) { alert('苦情処理申出先（派遣先）の全項目を入力してください'); return }
        if (!welfare) { alert('福利厚生施設の利用等を入力してください'); return }
        if (!safetyText) { alert('安全及び衛生を入力してください'); return }
        if (!conflictText) { alert('紛争防止措置を入力してください'); return }
        if (validateTel(cmd_tel) || validateTel(resp_tel) || validateTel(comp_tel)) { alert('電話番号の形式が正しくありません'); return }
        handleNext()
      }} />
    </>
  )
}
