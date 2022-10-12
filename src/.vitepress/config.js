const { resolve } = require('path')

module.exports = {
  title: 'web前端笔记',
  description: 'A static website for some notes',
  base: '/sf/',
  markdown: {
    lineNumbers: true
  },
  outDir: resolve(__dirname, '../../docs'),
  lastUpdated: true,
  cleanUrls: 'without-subfolders',

  // markdown: {
  //   headers: {
  //     level: [0, 0]
  //   }
  // },
  themeConfig: {
    nav: nav(),

    sidebar: {
      '/basic/': sidebarBasic(),
      '/frame/': sidebarFrame()
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/fightwithtiger/sf' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2022 fightwithtiger'
    },

  }

}

function nav() {
  return [
    { text: 'Basic', link: '/basic/web-manual', activeMatch: '/basic/' },
    { text: 'Vue/React', link: '/frame/vue', activeMatch: '/frame/' },
  ]
}

function sidebarBasic() {
  return [
    {
      text: 'Web Manual',
      // collapsible: true,
      items: [
        { text: 'common', link: '/basic/web-manual' },
      ]
    },
    {
      text: 'Promise, async/await, Generator',
      // collapsible: true,
      items: [
        { text: 'promise', link: '/basic/promise' },
        { text: 'async/await', link: '/basic/asyncAndAwait' },
        { text: 'Generator', link: '/basic/generator' }

      ]
    },
  ]
}

function sidebarFrame() {
  return [
    {
      text: 'Vue',
      items: [
        { text: 'basic', link: '/frame/vue' },
      ]
    },
    {
      text: 'React',
      items: [
        { text: 'basic', link: '/frame/react' },
      ]
    }
  ]
}