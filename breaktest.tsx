import { Document, Page, Text, View, StyleSheet, renderToFile } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 12 },
  row: { height: 40, borderWidth: 1, marginBottom: 4 },
})

const App = () => (
  <Document>
    <Page size="A4" style={styles.page}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={i} style={styles.row}><Text>Row {i}</Text></View>
      ))}
      <View break />
      <View style={styles.row}><Text>FORCED-BREAK-ROW</Text></View>
      <View style={styles.row}><Text>After forced row</Text></View>
    </Page>
  </Document>
)

renderToFile(<App />, 'breaktest.pdf').then(() => console.log('done'))
