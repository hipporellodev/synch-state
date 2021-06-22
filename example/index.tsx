import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createDocStore } from '../src';
import { useState } from 'react';
import { TodoApp } from './Todo';
import { applyMiddleware } from 'redux';
import history from '@syncstate/history';
import { Provider, useDoc } from '@syncstate/react';

const store = createDocStore({ todos: [], options: { filter: 'all' } }, []);




// store.intercept(
//   'doc',
//   '/todos',
//   (todos, change) => {
//     if (!change.origin && !remote.getLoading(store, '/todos')) {
//       // Don't emit for patches received from server
//       socket.emit('change', '/todos', change);
//     }
//     return change;
//     // return null;
//   },
//   Infinity
// );

const [doc, setDoc] = store.useSyncState('doc');
setDoc(doc => {
  doc.test = {};
  doc.test['/test3/test4/test5'] = 'paihwdih';
});
// const [test, setTest] = store.useDoc('/test');
// setTest('kkkkkk');
store.observe(
  'doc',
  '/test',
  val => {
    console.log('rerererererer &*(&(&&*(', val);
  },
  1
);

setTimeout(() => {
  setDoc(doc => (doc.test['/test3/test4/test5'] = 'KKKkkkkkk'));
}, 2000);
// undoable(() => true);

const disposeCompute = store.computeDoc((getValue, change) => {
  const todos = getValue('/todos');

  // const [val, setVal] = store.useDoc("path/to/nested/data")
  console.log('$$$computed todos.length', todos.length, 'change', change);
});

setTimeout(() => {
  disposeCompute();
}, 5000);

console.log(store.getPatches('doc'));

const disposeObs = store.observe(
  'doc',
  '/todos',
  (todos, change) => {
    console.log('patch generated at todos path');
    console.log('patch, inversePatch', change.patch, change.inversePatch);
  },
  1
);

const disposeInt = store.intercept(
  'doc',
  '/todos',
  (todos, change) => {
    console.log('patch intercepted at todos path');
    console.log('patch, inversePatch', change.patch, change.inversePatch);
    if (change.patches[0].path === '/todos/0' && change.patches[0].op === 'add') {
      return {
        ...change,
        patches: [{
          ...change.patches[0],
          value: { caption: 'Hello', completed: change.patches[0].value.completed },
        }],
      };
    }

    return change;
  },
  1
);

// setTimeout(() => {
//   disposeObs();
//   disposeInt();
// }, 10000);

const App = () => {
  return (
    <div>
    </div>
  );
};

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
);
