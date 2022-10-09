---
title: 简历相关问题
date: 2022-06-19 14:40:20
tags:
---

## 1.做过小程序和app两端使用，那请问h5怎么和小程序通信，怎么和app通信的呢（数据交互）？

小程序-》h5

通过src传参，主要避免使用中文字符，建议encodeURLComponent

h5 -> 小程序

通过wx.miniProgram.postMessage, webview组件上使用bindmessage监听

app

使用jsBridge，app通知h5使用回调函数形式

## 2.微信小程序全埋点sdk，你是怎么实现的呢？发送请求有什么调度策略吗？

拦截小程序的App，Component方法，然后重写原来的onShow等方法

[腾讯三面：说说前端监控平台/监控SDK的架构设计和难点亮点？ - 掘金](https://juejin.cn/post/7108660942686126093#heading-1)

整体设计：内核+插件

内核负责公共逻辑或基础逻辑，比如数据格式化和数据上报，还有sdk初始化。

插件负责业务逻辑，比如针对js错误监听等等。

需要注意的点：

1. sdk拓展业务的时候要保证原有业务的正确性，需要对每一个插件编写测试用例

2. sdk实现异常隔离以及上报，对每一个插件进行try，catch包裹，在出错时单独进行数据上报，好处是：sdk产生异常时不会影响业务流程，出现sdk异常时能够单独对异常模块错误进行上报

3. SDK 如何实现会话级别的错误上报去重
- 在用户的`一次会话`中，如果产生了同一个错误，那么将这同一个错误`上报多次`是`没有意义`的；
- 在用户的`不同会话`中，如果产生了同一个错误，那么将不同会话中产生的错误`进行上报`是`有意义`的；

```js
// 对每一个错误详情，生成一串编码
export const getErrorUid = (input: string) => {
  return window.btoa(unescape(encodeURIComponent(input)));
};
```

## 3.你会用canvas吗？遇到过什么问题？

## 4.这个后台管理项目前后端拆分是怎么实现的，你能简单说说吗？

## 5.说一下webpack打包优化做了什么工作？

未优化之前：生产打包后总体积大小：stat: 21.16, parsed: 3.81, gzipped: 1.05mb

### 1.通过webpack-bundle-analyzer可视化视图分析

在package.json设置script，`cross-env PACK=dev npm_config_report=true npm run build:dev`

初步发现问题：

1. 主要包vender.js过大，造成原因有：vant体积过大（这里需要判断是否没有按需引入），moment.js全部引入（这里可以打包后忽略本地化内容），
2. lodash.js在许多分包里存在，被重复引入
3. 生产打包有vconsole.min.js（用不到）

### 2.开始解决：

#### 1.vant 按需引入：安装babel-plugin-import，在.babelrc中添加配置：

```json
{
"plugins": [
    "libraryName": "vant",
    "libraryDirectory": "es",
    "style": true
  ]
}
```

优化结果：

stat: 20.63 parsed: 3.55 gziped: 995.35

#### 2.moment.js，使用IgnorePlugin忽略掉本地化内容

在webpack.config.js中添加plugin：new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)

优化后结果：stat: 20.14 parsed: 3.35 gzipped: 940.94kb

如果要使用本地文件：

```javascript
const moment = reuqire('moment')
require('moment/locale/ja')

moment.locale('ja')

// 然后再webpack.config.js中添加
plugins: [
    // 只加载moment/locale/ja.js
    new webpack.ContectReplacementPlugin(/moment[/\\]locale$/, /ja/),
]
```

#### 3.解决vconsole生产打包被引入

原来的实在main.js里根据启动环境引入vconsole，但是使用import会在编译时任然被打包

解决方案：使用vconsole-webpack-plugin插件，在webpack.config.js中添加

```javascript
const vConsolePlugin = require('vconsole-webpack-plugin')

new vConsolePlugin({
    enable: false // 不加入vconsole
})
```

优化后：stat: 19.99 parsed: 3.2 gzipped: 898.42kb

4.解决 lodash

就用了里面的each方法，使用Array.prototype.forEach替换后没有什么改变，所以直接干掉

优化后：stat: 14.28 parsed: 2.45 gizpped: 623.47kb

### 3.进一步找优化突破点

1.发现一个bscroll.esm.js在多个jchunk里出现，代码搜索发现只有两处组件在单独引入使用，猜测可能是多个页面在用这个组件，导致打包后多次引入该文件

为了减少引入，在main.js中绑定到Vue.prototype上，然后通过this去使用

优化结果：stat: 13.64 parsed: 2.1 gzipped: 526.68kb

2.发现一个复杂组件在多个页面被使用，但是打包时被重复生成了好多次

考虑使用Vue.use进行注册

优化结果：stat: 2.96 parsed: 1.51 gzipped: 421.01

3.发现一个minit-ui没有按需引入

安装babel-plugin-component

优化结果：stat: 2.73 parsed: 1.42 gzipped: 400.83

### 4.webpack-SplitChunks

刚刚做完各种按需或者移除某些库，打包后的体积已经可观了，紧接着就是主包（app.xxxx.js）过大问题，项目webpack版本过低，所以用的是

```javascript
new webpack.optimize.CommonsChunkPlugin({
    name: ['moment', 'vant', 'mint-ui', 'better-scroll'],
    filename: 'static/lib/[name].[chunkhash].js',
    minChunks: 2
})
```

直接将一些较大的在首页不需要用到的库打包到单独文件去，这样就减小了主包app的体积。但是因为多了几个js文件需要在index.html加载后下载，所以也算是问题吧，文件大小和文件数量也是去中间最好。

在高版本的webpack中使用splitChunks进行代码分割

https://zhuanlan.zhihu.com/p/152097785

用SplitChunks插件来控制Webpack打包生成的js文件的内容的精髓就在于，防止模块被重复打包，拆分过大的js文件，合并零散的js文件。最终的目的就是减少请求资源的大小和请求次数。因这两者是互相矛盾的，故要以项目实际的情况去使用SplitChunks插件，需切记中庸之道。