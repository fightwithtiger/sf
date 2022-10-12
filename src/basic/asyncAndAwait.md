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