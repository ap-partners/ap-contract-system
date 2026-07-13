import { Document, Page, Text, View, StyleSheet, renderToFile } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 12 },
  row: { height: 40, borderWidth: 1, marginBottom: 4 },
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
      {Array.from({ length: 10 }).map((_, i) => (
        <Row key={i} label={`Row ${i}`} />
      ))}
      <Row label="FORCED-BREAK-ROW" forceBreakBefore />
      <Row label="After forced row" />
    </Page>
  </Document>
)

renderToFile(<App />, 'breaktest2.pdf').then(() => console.log('done'))
