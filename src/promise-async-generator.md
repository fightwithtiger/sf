## Promise，async/await，generator知识点
https://juejin.cn/post/6844904096525189128#heading-0

### Promise

1. Promise 中为什么要引入微任务？ 由于promise采用.then延时绑定回调机制，而new Promise时又需要直接执行promise中的方法，即发生了先执行方法后添加回调的过程，此时需等待then方法绑定两个回调后才能继续执行方法回调，便可将回调添加到当前js调用栈中执行结束后的任务队列中，由于宏任务较多容易堵塞，则采用了微任务
2. Promise 中是如何实现回调函数返回值穿透的？ 首先Promise的执行结果保存在promise的data变量中，然后是.then方法返回值为使用resolved或rejected回调方法新建的一个promise对象，即例如成功则返回new Promise（resolved），将前一个promise的data值赋给新建的promise 
3. Promise 出错后，是怎么通过“冒泡”传递给最后那个捕获 promise内部有resolved_和rejected_变量保存成功和失败的回调，进入.then（resolved，rejected）时会判断rejected参数是否为函数，若是函数，错误时使用rejected处理错误；若不是，则错误时直接throw错误，一直传递到最后的捕获，若最后没有被捕获，则会报错。可通过监听unhandledrejection事件捕获未处理的promise错误

```javascript
class iPromise {
  constructor(executor) {
    // 存储promise结果
    this.promiseResult = undefined;
    // 存储promise的状态
    this.promiseState = "pending";
    // 存储所有的回调函数
    this.callbackList = [];

    // resolve方法，将promiseState变为fulfilled，并修改promiseResult
    const resolve = (value) => {
      // 仅在promiseState为pending的时候变化
      if (this.promiseState !== "pending") return;
      // 将promiseState变为fulfilled
      this.promiseState = "fulfilled";
      // 将value作为promiseResult
      this.promiseResult = value;
      // 异步执行所有回调函数
      this.callbackList.forEach((cb) => cb.onResolved(value));
    };

    // reject方法，将promiseState变为rejected，并修改promiseResult
    const reject = (error) => {
      // 仅在promiseState为pending的时候变化
      if (this.promiseState !== "pending") return;
      // 将promiseState变为rejected
      this.promiseState = "rejected";
      // 将error作为promiseResult
      this.promiseResult = error;
      // 异步执行所有回调函数
      this.callbackList.forEach((cb) => cb.onRejected(error));
    };

    // 立即执行executor
    // executor函数执行出现错误，会调用reject方法
    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  // 接收两个回调函数作为参数
  then (onResolved, onRejected) {
    if (typeof onResolved !== "function") {
      onResolved = (val) => val;
    }

    if (typeof onRejected !== "function") {
      onRejected = (err) => {
        throw err;
      };
    }

    /*
     * 这里必须要写箭头函数，否则this会指向新的Promise对象
     * 进而导致取不到promiseState和promiseResult
     */
    return new iPromise((resolve, reject) => {
      /*
       * 回调处理函数
       * 这里也请记得用箭头函数，this要穿透几层
       * 箭头函数就用几层
       */
      const handleCallback = (callback) => {
        try {
          let res = callback(this.promiseResult);
          // 若返回值是promise对象
          if (res instanceof Promise) {
            res.then(
              (val) => resolve(val),
              (err) => reject(err)
            );
          } else {
            // 若不是
            resolve(res);
          }
        } catch (error) {
          reject(error);
        }
      };

      // promiseState为fulfilled时调用onResolved
      if (this.promiseState === "fulfilled") {
        handleCallback(onResolved);
      }

      // promiseState为rejected时调用onRejected
      if (this.promiseState === "rejected") {
        handleCallback(onRejected);
      }

      /*
       * 如果是pending状态，则异步任务，在改变状态的时候去调用回调函数
       * 所以要保存回调函数
       * 因为promise实例可以指定多个回调，于是采用数组
       */
      if (this.promiseState === "pending") {
        this.callbackList.push({
          onResolved: () => {
            handleCallback(onResolved);
          },
          onRejected: () => {
            handleCallback(onRejected);
          },
        });
      }
    });
  }

  // catch方法
  catch (onRejected) {
    return this.then(undefined, onRejected);
  }

  finally (callback) {
    let P = this.constructor;
    return this.then(
      (value)  => P.resolve(callback()).then(() => value),
      (reason) => P.resolve(callback()).then(() => { throw reason })
    );
  }
    
   //静态的resolve方法
    static resolve(value) {
      if(value instanceof MyPromise) return value // 根据规范, 如果参数是Promise实例, 直接return这个实例
      return new MyPromise(resolve => resolve(value))
    }
    //静态的reject方法
    static reject(reason) {
      return new MyPromise((resolve, reject) => reject(reason))
    }
}
```

### async/await

async和await本质上就是一个generator和promise的语法糖，当解析到这个语法的时候就会就会把它转换成一个函数包裹着generator执行器。

比如原始：

```javascript
async function demo() {
  try {
    console.log(await Promise.resolve(1)) 
    console.log(await 2)   //2
    console.log(await Promise.reject('error'))
    return 3
  } catch (error) {
    console.log(error)
  }
}
```

转换成下面的函数，await全部都替换成了yeild

```javascript
function* myGenerator() {
  try {
    console.log(yield Promise.resolve(1)) 
    console.log(yield 2)   //2
    console.log(yield Promise.reject('error'))
    return 3
  } catch (error) {
    console.log(error)
  }
}

run(myGenerator)
```

可以看到就是一个run函数包裹一个generator函数。

关键在于这个run函数干的事，我们写await的时候是直接能够那到一个promise的，我们也不需要关心这个generator的next方法怎么去调用，所以这就是语法糖帮助我们做的事。
```javascript
function run (gen) {
  //把返回值包装成一个返回promise的函数
  return function () {
    var self = this
    var args = arguments

    return new Promise((resolve, reject) => {
      var g = gen.apply(self, args)
      _next();

      function _next (val) {
        //错误处理
        try {
          var res = g.next(val)
        } catch (err) {
          return reject(err);
        }
        if (res.done) {
          return resolve(res.value);
        }
        //res.value包装为promise，以兼容yield后面跟基本类型的情况
        Promise.resolve(res.value).then(
          val => {
            _next(val);
          },
          err => {
            //抛出错误
            g.throw(err)
          });
      }
    });
  }
}
```
可以看到实现的几点：
1. 最终我们拿到的应该还是一个函数，并且async关键字会让这个函数返回一个promise，所以我们让run方法也返回一个函数，这个函数返回一个promise
2. 执行generator函数，拿到gen实例，这样我们就可以调用next方法，一步一步执行yeild
3. 需要封装一个自己的next函数，这个next函数不仅要帮我们执行gen.next，还要用promise的形式去执行
4. done=true时就把值resolve出去，否者继续将value值通过Promise.resolve包裹成promise对象，不停的调用then方法执行后续的next方法，当然如果遇到了错误，就直接通过gen实例上的throw方法把错误传出去，同时不再调用next，中断后续的执行

**注意**
这里的throw代码其实还是有个问题，async函数执行返回的promise对象的status取决于函数内部有没有对错误进行捕获，例子里用try-catch捕获，所以最后的status就是fullfilled， 而如果没有用try-catch，那么错误就要向更上一层抛出，最后的status就是rejected。
可以分别执行下面例子，观察结果
```javascript
async function demo() {
  try {
    console.log(await Promise.resolve(1)) 
    console.log(await 2)   //2
    console.log(await Promise.reject('error'))
    return 3
  } catch (error) {
    console.log(error)
  }
}

async function demo2() {
  console.log(await Promise.resolve(1)) 
  console.log(await 2)   //2
  console.log(await Promise.reject('error'))
  return 3
}

console.log('demo', demo())
console.log('demo2', demo2())
```
所以上面的写法其实还是有问题，不过基本思路正确也差不多了
### generator
关于generator的中断机制，可以参考babel转换generator后的代码，下面是一个简版的实现
```javascript
// 生成器函数根据yield语句将代码分割为switch-case块，后续通过切换_context.prev和_context.next来分别执行各个case
function gen$(_context) {
  while (1) {
    switch (_context.prev = _context.next) {
      case 0:
        _context.next = 2;
        return 'result1';

      case 2:
        _context.next = 4;
        return 'result2';

      case 4:
        _context.next = 6;
        return 'result3';

      case 6:
      case "end":
        return _context.stop();
    }
  }
}

// 低配版context  
var context = {
  next:0,
  prev: 0,
  done: false,
  stop: function stop () {
    this.done = true
  }
}

// 低配版invoke
let gen = function() {
  return {
    next: function() {
      value = context.done ? undefined: gen$(context)
      done = context.done
      return {
        value,
        done
      }
    }
  }
} 

// 测试使用
var g = gen() 
g.next()  // {value: "result1", done: false}
g.next()  // {value: "result2", done: false}
g.next()  // {value: "result3", done: false}
g.next()  // {value: undefined, done: true}
```
所以简单来说generator执行后，其实就是返回了一个对象，上面有next方法，这个next方法返回了value和done，同时针对每一个generator实例都会有一个context对象，记录目前执行了几个yeild，当执行完毕后，就把done设置为true。
而中断机制其实也很简单，yeild并不是让函数暂停执行，每一次yeild其实都执行了一次函数，只是这个函数用switch-case把执行到第几步给隔离开了。
我们定义的function* 生成器函数被转化为以上代码
转化后的代码分为三大块：

gen$(_context)由yield分割生成器函数代码而来
context对象用于储存函数执行上下文
invoke()方法定义next()，用于执行gen$(_context)来跳到下一步


当我们调用g.next()，就相当于调用invoke()方法，执行gen$(_context)，进入switch语句，switch根据context的标识，执行对应的case块，return对应结果
当生成器函数运行到末尾（没有下一个yield或已经return），switch匹配不到对应代码块，就会return空值，这时g.next()返回{value: undefined, done: true}

从中我们可以看出，Generator实现的核心在于上下文的保存，函数并没有真的被挂起，每一次yield，其实都执行了一遍传入的生成器函数，只是在这个过程中间用了一个context对象储存上下文，使得每次执行生成器函数的时候，都可以从上一个执行结果开始执行，看起来就像函数被挂起了一样。