## Promise

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
