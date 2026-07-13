const XLSX = require('xlsx')
const wb = XLSX.readFile('/tmp/staff_test.xlsx', { cellDates: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
const row = rows.find(r => String(r['スタッフNO']).trim() === '105180' || String(r['スタッフNO']).trim().padStart(6,'0') === '105180')
if (!row) {
  console.log('row not found, sample keys:', Object.keys(rows[0]))
} else {
  console.log('raw 生年月日 value:', row['生年月日'])
  console.log('typeof:', typeof row['生年月日'], row['生年月日'] instanceof Date)
  if (row['生年月日'] instanceof Date) {
    const d = row['生年月日']
    console.log('toISOString():', d.toISOString())
    console.log('local getFullYear/Month/Date:', d.getFullYear(), d.getMonth()+1, d.getDate())
    console.log('UTC getUTCFullYear/Month/Date:', d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate())
  }
  console.log('住所1:', row['現在住所(住所1)'])
  console.log('住所2:', row['現在住所(住所2)'])
  console.log('住所3:', row['現在住所(住所3)'])
}
