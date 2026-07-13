const sharp = require('sharp')
const fs = require('fs')

const size = 280
const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.46}" fill="none" stroke="#C0392B" stroke-width="${size*0.035}"/>
  <text x="${size/2}" y="${size/2 - size*0.13}" text-anchor="middle" font-family="serif" font-size="${size*0.19}" fill="#C0392B">山田</text>
  <text x="${size/2}" y="${size/2 + size*0.16}" text-anchor="middle" font-family="serif" font-size="${size*0.19}" fill="#C0392B">太郎</text>
</svg>
`
sharp(Buffer.from(svg)).png().toFile('/tmp/pdftest_seal.png').then(() => {
  const b64 = fs.readFileSync('/tmp/pdftest_seal.png').toString('base64')
  fs.writeFileSync('/tmp/pdftest_seal_dataurl.txt', 'data:image/png;base64,' + b64)
  console.log('seal generated')
})
