# vue源码问题

## new Vue到底发生了什么？

定位到Vue的构造函数里：干了一件事，调用init方法，参数是options
而init主要干了的事：

1. 合并选项，向optons里添加一些额外属性
2. initProxy，定义了需要使用哪一种proxy handler，定义到vm\.renderProxy上，我也不知道这个是干什么的，但是从里面的提示警告信息来看，应该是约束一些设置的data和method的命名规范，比如data中属性不能以$和\_开头，这段代码的目的主要就是为Vue实例的_renderProxy属性赋值，而这个`_renderProxy`目测就是用在`render`函数中的。我们在`vue/src/core/instance/render.js`中

   ```javascript
   const { render, _parentVnode } = vm.$options
   ……
   currentRenderingInstance = vm
   vnode = render.call(vm._renderProxy, vm.$createElement)
   ```

   因此，这个`vm._renderProxy`实际上指定了我们传入的这个`render`函数在创建Vnode的时候执行的上下文this。
   回到上面，那么这个`initProxy`函数又是怎么给_renderProxy属性赋值的呢？

   ```javascript
   initProxy = function initProxy (vm) {
       if (hasProxy) {
           // determine which proxy handler to use
           const options = vm.$options
           const handlers = options.render && options.render._withStripped ? getHandler : hasHandler
           vm._renderProxy = new Proxy(vm, handlers)
   
       } else {
           vm._renderProxy = vm
       }
   }
   ```

   所以我们的`_renderProxy`属性赋值情况可以总结如下：

   1. 当前环境是开发环境，并且`hasProxy`条件成立，则调用Proxy方法，给vue实例添加代理
   2. 如果其他情况，则vue实例的_renderProxy属性指向vue实例本身。

3. vm\.\_self=vm 将自己设置到_self属性上
4. initLifecycle(vm)，初始化当前vm的部分一些生命周期重要属性和vm的parent和root，比如$parent(当前节点的第一个非抽象的父亲节点），$children，$refs, \_isMounted, \_isDestroyed, \_isBeginDestroyed_
5. initEvents(vm)，初始化\_events, hasHookEvent，获取父亲节点的listeners，如果有，则需要更新到当前节点里。更新方式就是调用$on和$off进行事件的监听和解绑。
6. initRender(vm)，向vm上添加render相关属性，比如_vnode，$slot，$scopeSlots，$createElement，将parent的attrs和listeners设置到vm上去（通过defoneReactive）
7. callHook(vm, 'beforeCreate') 此时完成了实例的初始化，但是还没有进行数据的侦听
8. initInjections(vm)，根据options中的inject选项，向上递归查找祖先的provide，拿到值（已经有key），然后再defineReactive到vm上
9. initState(vm)，按顺序初始化：props，methods，data，computed，watch
   - initProps: 关键在于两个：key和value，先通过key去找value，如果有就返回然后做一堆处理，其实就是挂载到某个变量下面，比如_props，没有就用props中的default值，返回之前需要做一个observe()，用于将这个值变成响应式。
   - initMethods: 做的内容很简单，`vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)`，就是把method挂载vm中，同时把方法进行bind一下vm，确保method中的this是当前的实例。
   - initData: 主要做一件事——`observe(data, true /* asRootData */)`响应式绑定。利用Object.defineProperty从写对象的set和get方法
   - initComputed: 下面有
   - initWatch：下面有

10. initProvide(vm)，初始化vm_provided

11. callHook(vm, 'created') 完成了数据的侦听，但是还没有进行挂载

我的感觉，再init里，其实做了两件事：

1. 初始化一些vue中需要使用的基础属性，不在options里体现
2. 将options里的属性进行处理，然后挂载到vm上

## computed和watch

## computed:

非服务端渲染下：

Object.defineProperty(vm, key, handler)

key是computed的key，重点获取值是在handler的get上，每个key都会有一个watcher，然后在handler的get方法中去使用watcher

```javascript
return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
         // computed 计算属性实现缓存的原理，标记当前回调函数在本次渲染周期内是否已经被执行过
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
```

在每次watcher.update时，会重新把dirty的值设置为true，然后重新调用一个get方法获取最新的值，否者就使用的是watcher中的老值。

## 实例销毁阶段

```javascript
Vue.prototype.$destroy = function () {
  const vm: Component = this
  if (vm._isBeingDestroyed) {
    return
  }
  callHook(vm, 'beforeDestroy')
  vm._isBeingDestroyed = true
  // remove self from parent
  const parent = vm.$parent
  if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
    remove(parent.$children, vm)
  }
  // teardown watchers
  if (vm._watcher) {
    vm._watcher.teardown()
  }
  let i = vm._watchers.length
  while (i--) {
    vm._watchers[i].teardown()
  }
  // remove reference from data ob
  // frozen object may not have observer.
  if (vm._data.__ob__) {
    vm._data.__ob__.vmCount--
  }
  // call the last hook...
  vm._isDestroyed = true
  // invoke destroy hooks on current rendered tree
  vm.__patch__(vm._vnode, null)
  // fire destroyed hook
  callHook(vm, 'destroyed')
  // turn off all instance listeners.
  vm.$off()
  // remove __vue__ reference
  if (vm.$el) {
    vm.$el.__vue__ = null
  }
  // release circular reference (#6759）
  if (vm.$vnode) {
    vm.$vnode.parent = null
  }
}
```

总结一下干了什么事情：

1. 触发beforeDestroyed钩子函数
2. 将自己从父节点移除
3. 移除vm上监听的watchers
4. 将_isDestroyed设置为true
5. patch(oldNode, null)，更新虚拟dom
6. 触发destroyed钩子函数
7. 调用$off关闭listeners
8. 将$el等等一些属性设置为空

## watch

拿到key和handler，内部调用了vm.$watch方法，在这里面创建一个watcher，在new的constructor里会把key赋值给getter属性，handler赋值给cb属性，在赋值watcher.value时就会调用this.get方法，get方法又会调用this.getter，因为这里getter是一个key值，所以watcher会处理下，执行this.getter()其实就是在访问vm[key], 这样就会触发响应式数据对应key的getter，就会收集这个watcher，然后在key值触发setter方法时，就会通知这个watcher，然后执行watcher.update方法，接着就是异步调度了，反正最后一定会执行watcher.run方法的，在这个方法里就会调用之前设置的cb方法，把watcher的新旧值传入，完成了一个watch的过程

```javascript
run () {
    if (this.active) {
      const value = this.get()
      if (value !== this.value || isObject(value) || this.deep) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
           // 就是在这里执行cb
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }
```

过程：initWatch, createWatcher, vm.$watch在这个函数里创建watcher

## Vue.extend实现原理

```javascript
//  src/global-api/initExtend.js
import { mergeOptions } from "../util/index";
export default function initExtend(Vue) {
  let cid = 0; //组件的唯一标识
  // 创建子类继承Vue父类 便于属性扩展
  Vue.extend = function (extendOptions) {
    // 创建子类的构造函数 并且调用初始化方法
    const Sub = function VueComponent(options) {
      this._init(options); //调用Vue初始化方法
    };
    Sub.cid = cid++;
    Sub.prototype = Object.create(this.prototype); // 子类原型指向父类
    Sub.prototype.constructor = Sub; //constructor指向自己
    Sub.options = mergeOptions(this.options, extendOptions); //合并自己的options和父类的options
    return Sub;
  };
}
```

https://juejin.cn/post/6954173708344770591

# vue的两个版本，以及编译过程

https://juejin.cn/post/6844904029877698568

https://juejin.cn/post/6907848991761760263

https://cn.vuejs.org/v2/guide/installation.html#%E5%AF%B9%E4%B8%8D%E5%90%8C%E6%9E%84%E5%BB%BA%E7%89%88%E6%9C%AC%E7%9A%84%E8%A7%A3%E9%87%8A

如果带有vue-loader，打包时就编译

还有一种是运行时编译，会在mount挂载时编译，第一次会有性能问题，后面会缓存起来，不会那么卡

这里的编译其实就是把template转换成渲染函数

template => render => vdom =>dom

这里的编译其实就三个流程：template => ast => render

compile具体点就是：先将通过parser解析template转换成一个ast，然后调用transform对ast进行一层加工得到一个新的ast，再通过generate方法把ast转换成渲染函数render，是一串字符串， 通过new Function的方式生成函数，就完成了。

在进行mount的时候，就会用到这个render，生成vdom，再通过patch方法，比较新老vdom进行生成真实dom

## 编译的具体流程

这里可以看到上面的三个流程，先通过parse把template转换成ast，再通过optimize对ast增加一些选项，最后通过generate将ast转化为render函数，对应下面代码中的code.render，这里注意，此时的code.render还是一个用字符串，里面是一个with函数

```js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

```js
export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options)
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}
```

再来看看createCompilerCreator函数实现，其实这个函数就是为了生成一个生成compiler的生成器--createCompiler，利用函数柯里化，把baseCompile函数扔进compile函数里，这样在compile函数里调用者只用关注baseOptions即可，具体的生成code.render已经在baseCompile里实现了。

```js
function createCompilerCreator (baseCompile) {
  return function createCompiler (baseOptions) {
    function compile (
      template,
      options
    ) {
      var compiled = baseCompile(template, finalOptions);
      compiled.errors = errors;
      compiled.tips = tips;
      return compiled
    }

    return {
      compile: compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

此时我们调用`var ref = createCompiler(baseOptions);var compile = ref.compile;`就拿到了compile函数。

调用compile函数传入template和options，就可以得到compiled对象，我们主要取上面的render属性值，注意这里<font color=#ec7259>**compiled.render是个字符串**</font>，所以我们通过createFuntion把它变成一个真正的函数，createFunction内部实现就是`return new Function(code)`

```js
var compiled = compile(template, options);

// turn code into functions
var res = {};
var fnGenErrors = [];
res.render = createFunction(compiled.render, fnGenErrors);
res.staticRenderFns = compiled.staticRenderFns.map(function (code) {
   return createFunction(code, fnGenErrors)
});
```

# vue路由守卫

全局路由守卫，路由独享守卫，组件级路由守卫

https://router.vuejs.org/zh/guide/advanced/navigation-guards.html

# keep-alive实现

组件上三个参数：include, exclude, max

其中include表示需要缓存的组件，exclude表示不需要被缓存的组件

本质上其实就是一个组件，接受三个prop，然后render函数执行返回出子组件的vnode就好了

细说：

会通过this.$slots.default拿到子组件们，然后通过getFirstComponentChild(slot)拿到第一个子组件（其实就是子组件对的vnode），通过vnode上的componentOptions得到组件相关信息。

重要的是component的name，作为key标识这个组件。

然后那这个name去include和exclude里里面去找，如果是不需要缓存的，就直接返回该vnode，跳过后续的缓存处理

如果需要缓存：

1. 先判断cache[key]存不存在，不存在设置上去，不过设置后需要判断下缓存个数有没有超过max，**超过了就把第一个缓存的组件cache[keys[0]]给干掉**，为什么选第0个，**其实就是因为这个组件已经很久没有使用了**

2. 如果存在，就把缓存的组件实例设置到当前的vnode上
   
   ```javascript
   vnode.componentInstance = cache[key].componentInstance
          // make current key freshest
          remove(keys, key)
          keys.push(key)
   ```
   
   这里的remove和push操作就很灵性了，先remove掉，然后再push进去，这样就能保证keys数组的顺序，越靠前的就是越没有被使用的，为上面的删除做保证

3. ```javascript
   vnode.data.keepAlive = true
   ```
   
   最后给keep-alive缓存的组件打上标记

4. 返回改造好的vnode

还有个watch需要提一提：

```javascript
mounted () {
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },
```

在该组件mounted的时候会去设置观察indclue和exclue属性，就是把新值与旧值做对比，以include为例子，如果新include值中[1, 2, 3]，旧include[1, 2, 3, 4, 5]，那么就是把原来cache中的4，5缓存给干掉。

# vue3相关

## 1.reactivity（响应式模块）

主要涉及reactive和ref两个api，其他的只是增加了点条件而已

## proxy

vue3中使用proxy去劫持对象，返回的其实是这个新的proxy对象。其中，这个proxy中的主要两个方法setter和getter定义如下

```javascript
function createGetter(isReadonly = false, shallow = false) {
  return function get(target, key, receiver) {
    const isExistInReactiveMap = () =>
      key === ReactiveFlags.RAW && receiver === reactiveMap.get(target);

    const isExistInReadonlyMap = () =>
      key === ReactiveFlags.RAW && receiver === readonlyMap.get(target);

    const isExistInShallowReadonlyMap = () =>
      key === ReactiveFlags.RAW && receiver === shallowReadonlyMap.get(target);

    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly;
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly;
    } else if (
      isExistInReactiveMap() ||
      isExistInReadonlyMap() ||
      isExistInShallowReadonlyMap()
    ) {
      return target;
    }

    const res = Reflect.get(target, key, receiver);

    // 问题：为什么是 readonly 的时候不做依赖收集呢
    // readonly 的话，是不可以被 set 的， 那不可以被 set 就意味着不会触发 trigger
    // 所有就没有收集依赖的必要了

    if (!isReadonly) {
      // 在触发 get 的时候进行依赖收集
      track(target, "get", key);
    }

    if (shallow) {
      return res;
    }

    if (isObject(res)) {
      // 把内部所有的是 object 的值都用 reactive 包裹，变成响应式对象
      // 如果说这个 res 值是一个对象的话，那么我们需要把获取到的 res 也转换成 reactive
      // res 等于 target[key]
      return isReadonly ? readonly(res) : reactive(res);
    }

    return res;
  };
}

function createSetter() {
  return function set(target, key, value, receiver) {
    const result = Reflect.set(target, key, value, receiver);

    // 在触发 set 的时候进行触发依赖
    trigger(target, "set", key);

    return result;
  };
}
```

原来vue2中进行依赖收集和触发，是通过dep来收集依赖，然后在set的时候通过调用dep.notify方法来触发每一个watcher.update()。在vue3中是通过`track(target, 'get', key)`的方式进行依赖收集，然后通过`trigger(target, 'set', key)`的方法进行触发。

## effect

这个函数代替了原来vue2的new Watcher，核心就是接收一个fn，然后去创建一个ReactiveEffect实例（这里取名为_effect），接着立即去调用_effect.run()方法，其实就是执行fn。不过在执行fn前后会设置activeEffect，用作tract时添加到dep里面，完成了依赖收集，后续只要set了变量就会触发trigger方法，然后去遍历当前dep下的所有effect，依次去调用它们的run方法。

```javascript
import { extend } from "../utils";
import { createDep } from "./dep";

let activeEffect = null
let shouldTrack = false
const targetMap = new WeakMap()

export class ReactiveEffect {

  constructor(fn) {
    this.active = true
    this.fn = fn
    this.deps = []
  }

  run () {
    if (!this.active) {
      return this.fn();
    }

    // 执行 fn  收集依赖
    // 可以开始收集依赖了
    shouldTrack = true;

    // 执行的时候给全局的 activeEffect 赋值
    // 利用全局属性来获取当前的 effect
    activeEffect = this
    // 执行用户传入的 fn
    console.log("执行用户传入的 fn");
    const result = this.fn();
    // 重置
    shouldTrack = false;
    activeEffect = undefined;

    return result;
  }

  stop () {
    if (this.active) {
      // 如果第一次执行 stop 后 active 就 false 了
      // 这是为了防止重复的调用，执行 stop 逻辑
      cleanupEffect(this);
      this.active = false;
    }
  }
}

function cleanupEffect (effect) {
  effect.deps.forEach((dep) => {
    dep.delete(effect)
  })

  effect.deps.length = 0;
}

export function effect (fn, options = {}) {
  const _effect = new ReactiveEffect(fn)
  extend(_effect, options)

  _effect.run()

  const runner = _effect.run.bind(_effect)
  runner.effect = _effect

  return runner;
}


export function track (target, type, key) {
  if (!isTracking()) {
    return;
  }
  let depsMap = targetMap.get(target)

  if (!depsMap) {
    depsMap = new Map()
    targetMap.set(target, depsMap)
  }

  let dep = depsMap.get(key)
  if (!dep) {
    dep = createDep();

    depsMap.set(key, dep);
  }

  trackEffects(dep)
}

export function trackEffects (dep) {
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect)
    activeEffect.deps.push(dep)
  }
}

export function trigger (target, type, key) {
  let deps = [];

  const depsMap = targetMap.get(target);

  if (!depsMap) return;
  const dep = depsMap.get(key);

  // 最后收集到 deps 内
  deps.push(dep);

  const effects = [];
  deps.forEach((dep) => {
    // 这里解构 dep 得到的是 dep 内部存储的 effect
    effects.push(...dep);
  });
  // 这里的目的是只有一个 dep ，这个dep 里面包含所有的 effect
  // 这里的目前应该是为了 triggerEffects 这个函数的复用
  triggerEffects(createDep(effects));
}

export function triggerEffects (dep) {
  // 执行收集到的所有的 effect 的 run 方法
  for (const effect of dep) {
    effect.run();
  }
}

function isTracking() {
  return shouldTrack && activeEffect !== undefined;
}
```

注意的是，这里的dep其实就是一个Set集合，代替了vue2中的Dep



## 2. createApp发生了什么

## runtime-dom runtime-core

通过`import { createApp } from 'vue'`导入的createApp函数处于runtime-dom目录下，

这个createApp函数主要作用是给我们一个app实例，然后调用上面的use, component, directive, mount等方法而已。

我们使用的createApp函数其实是被包装过一层后返回的，主要是因为可以针对多平台复用。

```typescript
export const createApp = ((...args) => {
  const app = ensureRenderer().createApp(...args)

  const { mount } = app
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (!container) return

    const component = app._component

    // clear content before mounting
    container.innerHTML = ''
    const proxy = mount(container, false, container instanceof SVGElement)
    if (container instanceof Element) {
      container.removeAttribute('v-cloak')
      container.setAttribute('data-v-app', '')
    }
    return proxy
  }

  return app
}) as CreateAppFunction<Element>
```

可以看到真正的app实例其实是调用ensureRenderer().createApp(...args)得到的。

而ensureRenderer调用了runtime-core下的createRenderer方法，其实就是创建一个与平台相关的renderer

```typescript
// runtime-dom/index.ts
function ensureRenderer() {
  return (
    renderer ||
    (renderer = createRenderer<Node, Element | ShadowRoot>(rendererOptions))
  )
}

// runtime-core/renderer.ts
export function createRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement
>(options: RendererOptions<HostNode, HostElement>) {
  return baseCreateRenderer<HostNode, HostElement>(options)
}
```

在baseCreateRenderer函数中，可以看到最终返回的其实就是一个对象实例，上面有createApp函数

```typescript
return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate)
  }
```

可以看到`createApp: createAppAPI(render, hydrate)`上提供了render函数，这个其实就是用来做平台区分的，不同的平台可以提供不同的render，来对vue进行移植扩展。

此处的**render**函数不是组件的render函数，这里的作用是利用组件的render函数生成的vdom，然后进行patch的。

```typescript
const render: RootRenderFunction = (vnode, container, isSVG) => {
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
      }
    } else {
      patch(container._vnode || null, vnode, container, null, null, null, isSVG)
    }
    flushPostFlushCbs()
    container._vnode = vnode
  }
```

然后看看runtime-core/apiCreateAppAPI.ts文件

```typescript
export function createAppAPI<HostElement>(
  render: RootRenderFunction,
  hydrate?: RootHydrateFunction
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent, rootProps = null) {
    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && warn(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }

    const context = createAppContext()
    const installedPlugins = new Set()

    let isMounted = false

    const app: App = (context.app = {
      _uid: uid++,
      _component: rootComponent as ConcreteComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,

      version,

      get config() {
        return context.config
      },

      set config(v) {
      },

      use(plugin: Plugin, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
          __DEV__ && warn(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin)
          plugin(app, ...options)
        } e
        return app
      },

      mixin(mixin: ComponentOptions) {
        if (__FEATURE_OPTIONS_API__) {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (__DEV__) {
            warn(
              'Mixin has already been applied to target app' +
                (mixin.name ? `: ${mixin.name}` : '')
            )
          }
        } else if (__DEV__) {
          warn('Mixins are only available in builds supporting Options API')
        }
        return app
      },

      component(name: string, component?: Component): any {
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          return context.components[name]
        }
        context.components[name] = component
        return app
      },

      directive(name: string, directive?: Directive) {
        if (__DEV__) {
          validateDirectiveName(name)
        }

        if (!directive) {
          return context.directives[name] as any
        }
        context.directives[name] = directive
        return app
      },

      mount(
        rootContainer: HostElement,
        isHydrate?: boolean,
        isSVG?: boolean
      ): any {
        if (!isMounted) {
          const vnode = createVNode(
            rootComponent as ConcreteComponent,
            rootProps
          )
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          vnode.appContext = context

          // HMR root reload
          if (__DEV__) {
            context.reload = () => {
              render(cloneVNode(vnode), rootContainer, isSVG)
            }
          }

          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            render(vnode, rootContainer, isSVG)
          }
          isMounted = true
          app._container = rootContainer
          // for devtools and telemetry
          ;(rootContainer as any).__vue_app__ = app

          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = vnode.component
            devtoolsInitApp(app, version)
          }

          return vnode.component!.proxy
        } e
      },

      unmount() {
        if (isMounted) {
          render(null, app._container)
          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = null
            devtoolsUnmountApp(app)
          }
          delete app._container.__vue_app__
        } e
      },

      provide(key, value) {
        context.provides[key as string] = value

        return app
      }
    })

    if (__COMPAT__) {
      installAppCompatProperties(app, context, render)
    }

    return app
  }
}
```

这个函数的作用就是通过我们传递进来的render函数来生成一个真正的createApp方法。这个createApp方法就是我们最外层看到的`const app = ensureRenderer().createApp(...args)`调用的方法。生成的app实例就代码中的那样，挂了一些属性和use等方法，重点在于mount方法，用在我们挂载`app.mount()`

可以看到在mount方法中会调用render函数，这就是我们通过createAppApi传递进行来的，由上面可以知道，其实调用mount方法，先会创建一个当前组件的vnode，然后调用render函数，也就是上面我们说的，进行vnode的patch。

patch源码在runtime-core/renderer.ts 463行中。

作用其实就是根据vnode的类型进行不同的挂载操作。由于第一次挂载，我们vnode的类型应该是组件，所以走了switch case中的下面分支

```typescript
 } else if (shapeFlag & ShapeFlags.COMPONENT) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            slotScopeIds,
            optimized
          )
        } 
```

**processComponent**函数的作用其实就是调用了**mountComponent**

这个mountComponent作用和vue2一样，但是功能复杂了许多

```typescript
 const mountComponent: MountComponentFn = (
    initialVNode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    // 2.x compat may pre-creaate the component instance before actually
    // mounting
    const compatMountInstance =
      __COMPAT__ && initialVNode.isCompatRoot && initialVNode.component
    const instance: ComponentInternalInstance =
      compatMountInstance ||
      (initialVNode.component = createComponentInstance(
        initialVNode,
        parentComponent,
        parentSuspense
      ))

    if (__DEV__ && instance.type.__hmrId) {
      registerHMR(instance)
    }

    if (__DEV__) {
      pushWarningContext(initialVNode)
      startMeasure(instance, `mount`)
    }

    // inject renderer internals for keepAlive
    if (isKeepAlive(initialVNode)) {
      ;(instance.ctx as KeepAliveContext).renderer = internals
    }

    // resolve props and slots for setup context
    if (!(__COMPAT__ && compatMountInstance)) {
      if (__DEV__) {
        startMeasure(instance, `init`)
      }
      setupComponent(instance)
      if (__DEV__) {
        endMeasure(instance, `init`)
      }
    }

    // setup() is async. This component relies on async logic to be resolved
    // before proceeding
    if (__FEATURE_SUSPENSE__ && instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect)

      // Give it a placeholder if this is not hydration
      // TODO handle self-defined fallback
      if (!initialVNode.el) {
        const placeholder = (instance.subTree = createVNode(Comment))
        processCommentNode(null, placeholder, container!, anchor)
      }
      return
    }

    setupRenderEffect(
      instance,
      initialVNode,
      container,
      anchor,
      parentSuspense,
      isSVG,
      optimized
    )

    if (__DEV__) {
      popWarningContext()
      endMeasure(instance, `mount`)
    }
  }
```

函数核心调用了两个：**setupComponent(instance)**and**setupRenderEffect**

1. 第一个函数：相当于vue2中的this._init()

   ```typescript
   export function setupComponent(
     instance: ComponentInternalInstance,
     isSSR = false
   ) {
     isInSSRComponentSetup = isSSR
   
     const { props, children } = instance.vnode
     const isStateful = isStatefulComponent(instance)
     initProps(instance, props, isStateful, isSSR)
     initSlots(instance, children)
   
     const setupResult = isStateful
       ? setupStatefulComponent(instance, isSSR)
       : undefined
     isInSSRComponentSetup = false
     return setupResult
   }
   ```

2. 第二个函数: 相当于vue2中组件级别的Watcher，用于渲染和绑定依赖后的更新函数

   ```typescript
   const effect = new ReactiveEffect(
       componentUpdateFn,
       () => queueJob(instance.update),
       instance.scope // track it in component's effect scope
   )
   ```

   

在**setupRenderEffect**函数中会拿到当前组件的subTree，然后继续patch，一个递归的过程完成整棵树的构建。



# vue实例挂载过程中发生了什么

挂在过程中完成了两件事：

1. 初始化

2. 建立更新机制

回答范例：

1. 挂载过程指的是app.mount()过程，这个是个初始化过程，整体做了两件事：初始化和建立更新机制

2. 初始化会创建组件实例，就是app下面的很多子组件，初始化组件状态，创建各种响应式数据

3. 建立更新机制这一步会立即执行依次组件更新函数，这回首次执行组件渲染幻术并执行patch将前面获得的vnode转换为dom，同时首次执行渲染函数会创建它内部响应式数据和组件更新函数之间的依赖关系，这使得以后的数据变化时会执行对应的更新函数

# vue优化方法

1. 路由懒加载，用异步组件的方式去加载页面，在访问时才去加载，打包时可以更小，比如使用es6引入的import函数，https://juejin.cn/post/6844903614616436750

2. keep-alive缓存页面或者组件，避免重复组件实例，且能保留组件状态

3. 使用v-show，复用dom，避免重复创建组件

4. v-for和v-if避免重复使用（vue2）

5. 使用v-once和v-memo

6. 使用虚拟列表，网上有一些开源库

7. 一些事件，比如setInterval，eventListener在组件销毁时解绑

8. 图片懒加载v-lazyload

9. 第三方插件按需加载

10. 抽离组件要适当，无状态不要过度拆分

11. 服务端渲染

12. 在 Vue 之中，一个子组件只会在其至少一个 props 改变时才会更新。思考以下示例：

    ```vue
    <ListItem
      v-for="item in list"
      :id="item.id"
      :active-id="activeId" />
    ```

    在 `<ListItem>` 组件中，它使用了 `id` 和 `activeId` 两个 props 来确定它是否是当前活跃的那一项。虽然这是可行的，但问题是每当 `activeId` 更新时，列表中的**每一个** `<ListItem>` 都会跟着更新！

    理想情况下，只有活跃状态发生改变的项才应该更新。我们可以将活跃状态比对的逻辑移入父组件来实现这一点，然后让 `<ListItem>` 改为接收一个 `active` prop：

    ```vue
    <ListItem
      v-for="item in list"
      :id="item.id"
      :active="item.id === activeId" />
    ```

    现在，对于大多数的组件来说，`activeId` 改变时，它们的 `active` prop 都会保持不变，因此它们无需再更新。总结一下，这个技巧的核心思想就是让传给子组件的 props 尽量保持稳定。


# vue2中为什么组件根节点只能有一个

因为vdom是一个棵单根属性结构，path方法在遍历的时候从根节点进行遍历，要求只能有一个根节点，所以组件只能单根。

vue3中可以写多个根节点是因为引入了Fragment概念，这是一个抽象节点，如果组件时多根的，就会创建一个Fragment节点，把多个根节点当成它的children，将来patch的时候如果发现是Fragment节点旧直接遍历children创建或更新

# vue3编译优化策略

1. 静态节点提升，内存换取时间，如果是静态节点，会在第一次编译生成render的过程中，用一个全局变量保存它的vnode，后续就不再管了。下面代码中的`<p>123</p>`就属于静态节点

2. 补丁标记和动态属性记录（patchFlag)，再调用createVNode的方法中会多穿点参数，分别表示当前节点动态的类型（属性动态，文本动态，属性和文本动态），以及动态属性对应的名称key，这样再下次更新的时候只需要看动态的属性或文本，以及动态的变量名称

3. 缓存事件处理程序，下面代码中click事件，在第一次编译的时候会缓存起来，其实就是`cache[key] = (...args) =>(_ctx.onClick(...args))`，用一个箭头函数包裹，放入缓存，下次来的时候就不用再次生成这个函数了。react里可以通过userCallback实现同样的效果，vue里在编译阶段帮我们干了这件事。

4. 块block，将动态的节点用一个动态节点数组存起来，这样下次update的时候就不用遍历整棵树，而是去遍历数据就好了，时间就只有O(n)。利用createBlock把根节点创建成一个区块，这里边会有一个属性dynamicChildren（动态子节点），用来保存动态的子节点，将来遍历这个数据就好了。比如下面代码，这个数组中指挥存第一个p节点和span节点，这样更新的时候直接操作动态节点了。这里我们引入一个概念“区块”，内部结构是稳定的一个部分可被称之为一个区块。在这个用例中，整个模板只有一个区块，因为这里没有用到任何结构性指令 (比如 `v-if` 或者 `v-for`)。

   每一个块都会追踪其所有带更新类型标记的后代节点 (不只是直接子节点)

```html
<div>
    <p :title="foo" :id="foo" @click="onClick"></p> 
    <p>123</p>
    <p>
        <span>{{test}}</span>
</div>
```

# vue中的更新机制

## 1.vue2 中render watcher触发机制

[🚩Vue源码——订阅者的收集 - 掘金](https://juejin.cn/post/6887966751703695374)

mount

mountComponent

## 首次渲染

mountComponent中会new一个Watcher，把updateComponent传入到第二个参数赋值给watcher.getter，new Watcher时，会先执行一遍watcher.get方法，在这里面会设置Dep.Target = this，然后执行getter方法，即上面传入的updateComponent方法，在这里面访问的所有响应式数据的getter方法被触发，完成依赖搜集，然后updateComponent方法作用就是利用render函数生成的vnode，与老的（第一次没有为null）进行patch，生成真实dom，完成第一次渲染。

`vm._render()` 生成 vnode 的过程中会去读取 data 中的数据，会触发数据的 getter 函数，在其中收集订阅者，所以后续数据更新能够触发render watcher。

## 数据更新

数据更新，触发watcher.update执行queueWatcher(this)

nextTick(flushSchedulerQueue)

p.then(flushCallBacks)

flushCallbacks()

flushSchedulerQueue() 遍历queue，执行所有watcher的更新函数

watcher.run()

watcher.get()

watcher.getter()

updateComponent()

vnode = vm._render()

_update(vnode)

```javascript
if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
```

**patch**(oldDom, vDom)

这个patch函数是在web/platform/index.js下设置上的，因为要区分平台，不同的平台要使用不同的patch方案，其实就是将vnode转成真是视图dom所用的一些函数，比如创建节点，删除节点，移动节点等等。

## 2.vue3中更新机制

第一次加载根组件时：

mount

vnode = createVNode()

render(vnode)

patch(null, vnode)

在patch中通过vnode的shapFlag（在share目录下看）来进行不同的操作。第一次加载时，只有根组件，shapFlag就是4，就会调用processCompoment

在processComponent里再调用mountComponent

mountComponent里创建Component实例instance

然后关键在setupRenderEffect

instance.update = effect(componentEffect, scheduler)，在这里进行数据响应式的依赖收集，触发track。

```typescript
const effect = new ReactiveEffect(
      componentUpdateFn,
      () => queueJob(instance.update),
      instance.scope // track it in component's effect scope
    )

    const update = (instance.update = effect.run.bind(effect) as SchedulerJob)
```

当值改变的时候会触发set，在set里会触发trigger

trigger则会执行ReactiveEffect实例中的run方法

而run方法的执行与传入的scheduler有关，如果传入了则按照scheduler的方式去执行

这个渲染的scheduler里执行其实就是执行queueJob，放入队列queue

然后定义一个queueFlush，这个函数就是用异步的方式去执行flushJobs，他会用一个变量currentFlushPromise来保存`currentFlushPromise = resolvePromise.then(flushJobs)`

flushJobs就是遍历queue，queue里面的effect都会被执行，就完成了异步更新

## 3.vue3中nextTick

注意2中的currentFlushPromise，直接拿p，如果之前触发了vue中的更新是会有currentFlushPromise的，然后通过then执行nextTick中的fn，这就很巧妙的完成了一个执行顺序问题，在原来vue2中，如果属性触发了更新，会先将flushSchedulerQueue推入到flushCalbacks，这样由一个数组遍历来维护执行顺序，而vue3，通过then的方式能够更加严格的保证上一个任务执行完后才执行下一个。

```javascript
export function nextTick<T = void>(
  this: T,
  fn?: (this: T) => void
): Promise<void> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
```

# Vue2中lifeCycle.js的几个api分析

在这个文件里lifecycleMixin函数的主要作用就是往Vue.prototype挂上_update，$foreUpdate，

$destory，

## 1. $foreUpdate

```js
 Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }
```

就是把实例上的watcher执行一下update函数。

## 2. $destory

```js
Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
```

整体流程如下：

1. 判断当前组件实例是否已经开始被销毁了（vm._isBeingDestroy)

2. 触发beforeDestory钩子，设置vm._isBeingDestroy = true

3. 拿到父实例，从上面移除掉自己

4. 调用watcher.teardown，把自己的watcher从依赖中心中移除掉

5. 设置`vm._isDestoryed`

6. 调用patch方法，patch(vnode, null)，把newVnode设置为null，从dom上移除当前组件dom

7. 触发destroyed钩子

8. vm.$off()，关闭上面的listeners

9. 把一些属性置为null

# patchVnode 比较两个vnode

包括三种类型操作：属性更新，文本更新，子节点更新

具体规则：

1. 新老节点均有children子节点，则对子节点进行diff操作，调用updateChildren；
2. 如果新节点有子节点，而老节点没有子节点，则清空老节点对的文本内容，然后新增子节点；
3. 如果新节点没有子节点，而老节点有子节点，则移除老节点上的所有子节点；
4. 如果新老节点都无子节点时，就只做文本替换。

# vue中css scroped实现原理

https://juejin.cn/post/6844903965746790408

# vue-router实现原理

两大类：hash，history，区别是hash有#
vue-router根据mode参数来选择路由。
支持三种：history-HTML5History，hash-HashHistory，abstract-AbstractHistory
hash:
push:
$router.push() 调用方法-> HashHistory.push()设置hash，window.location.hash -> History.transitionTo() 检测更新-> History.updateRoute() 更新路由-> app._route替换当前app路由 -> vm.render()更新视图
replace: 
window.location.replace()

history:
通过history.pushState(), history.replaceState()，

## hash

hash变化会触发网页跳转，即浏览器的前进和后退。

`hash` 可以改变 `url` ，但是不会触发页面重新加载（hash的改变是记录在 `window.history` 中），即不会刷新页面。也就是说，所有页面的跳转都是在客户端进行操作。因此，这并不算是一次 `http` 请求，所以这种模式不利于 `SEO` 优化。`hash` 只能修改 `#` 后面的部分，所以只能跳转到与当前 `url` 同文档的 `url` 。

`hash` 通过 `window.onhashchange` 的方式，来监听 `hash` 的改变，借此实现无刷新跳转的功能。

`hash` 永远不会提交到 `server` 端（可以理解为只在前端自生自灭）。

## history

如果是用户在当前用histroy模式操作切换页面的话，URL会被改变、浏览器不会刷新页面也不会往服务端发请求，但会触发代码内的监听事件从而改变页面内容，所以无需用到服务器也可以自由切换页面了。但是这里有个很核心的点就是URL会改变，即有新的URL诞生，所以如果这时用户主动刷新页面（F5），浏览器发送给服务端的是新的URL，所以服务端要做适配，配置一个合理的规则让这些URL返回的都是同一个index.html

# 双向绑定和 vuex 是否冲突

https://vuex.vuejs.org/zh/guide/forms.html#%E5%8F%8C%E5%90%91%E7%BB%91%E5%AE%9A%E7%9A%84%E8%AE%A1%E7%AE%97%E5%B1%9E%E6%80%A7

# nextTick

https://www.jianshu.com/p/a7550c0e164f

# sync语法糖实现原理

https://www.jianshu.com/p/b149f9fd8178?utm_campaign=maleskine&utm_content=note&utm_medium=seo_notes&utm_source=recommendation