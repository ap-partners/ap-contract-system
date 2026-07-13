require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  let all = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('staff')
      .select('employee_number, name, name_kana, dept_no, contract_type, hired_at, birthday, retired_at, retirement_scheduled_at, address, crew_code')
      .range(from, from + pageSize - 1)
      .order('employee_number')
    if (error) { console.error(error); process.exit(1) }
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  require('fs').writeFileSync('/tmp/staff_db.json', JSON.stringify(all))
  console.log('rows:', all.length)
}
main()
