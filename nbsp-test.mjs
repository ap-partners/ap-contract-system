import { Font, Document, Page, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import fs from 'fs';
import path from 'path';

Font.register({ family: 'BodyFont', fonts: [{ src: path.join(process.cwd(),'assets','fonts','ipaexm.ttf'), fontWeight:'normal'}] });
Font.registerHyphenationCallback(word => [word]);

const styles = { page: { fontFamily: 'BodyFont', fontSize: 8.3, padding: 20 } };
const NBSP = ' ';
const text1 = `定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円${NBSP}/${NBSP}km】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。`;
const doc = React.createElement(Document, null,
  React.createElement(Page, { size: 'A4', style: styles.page },
    React.createElement(Text, { style: { width: 380 } }, text1)
  )
);
const buf = await renderToBuffer(doc);
fs.writeFileSync('/tmp/nbsp_test.pdf', buf);
console.log('done');
