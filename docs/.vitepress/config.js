const { resolve } = require('path')

module.exports = {
  title: 'fightwithtiger',
  description: 'A static website for some notes',
  base: '/sf/',
  markdown: {
    lineNumbers: true
  },
  outDir: resolve(__dirname, '../dist')
}