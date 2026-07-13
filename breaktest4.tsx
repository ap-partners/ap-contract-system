import { Document, Page, Text, View, StyleSheet, renderToFile } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 12 },
  table: { borderWidth: 1 },
  row: { height: 40, borderBottomWidth: 1, flexDirection: 'row' },
})

const Row = ({ label, forceBreakBefore }: { label: string; forceBreakBefore?: boolean }) => (
  <>
    {forceBreakBefore && <View break />}
    <View wrap={false} style={styles.row}><Text>{label}</Text></View>
  </>
)

const App = () => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.table}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Row key={i} label={`Row ${i}`} />
        ))}
        <Row label="FORCED-BREAK-ROW" forceBreakBefore />
        {Array.from({ length: 20 }).map((_, i) => (
          <Row key={100+i} label={`After row ${i}`} />
        ))}
      </View>
    </Page>
  </Document>
)

renderToFile(<App />, 'breaktest4.pdf').then(() => console.log('done'))
