import {
  Store,
  CombinedState,
  Dispatch,
  Unsubscribe,
  createStore,
  combineReducers,
  applyMiddleware,
  compose,
} from 'redux';
import { createInterceptMiddleware, Interceptor } from './interceptMiddleware';
import { createObserveMiddleware, Observer } from './observeMiddleware';
import get from 'lodash/get';
import useSyncState from './storeMethods/useSyncState';
import { SyncStatePath } from './index';
import removeFirstElement from './utils/jsonPatchPathToImmerPath';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';
import getNextId from './utils/getNextId';
import { Watch, ComputeCallback } from 'types';
import { createPostObserveMiddleware } from './postObserveMiddleware';
import { createPostInterceptMiddleware } from './postInterceptMiddleware';
import rebaseNeeded from "./utils/rebaseNeeded";

type ReduxStore = Store<
  CombinedState<{
    [x: string]: any;
  }>,
  any
>;

export default class DocStore {
  reduxStore: ReduxStore;
  rebaseInProgressObserver:any =  null;
  rebaseCommandId:any = null;
  subscribe: (listener: () => void) => Unsubscribe;
  plugins: Array<any>;
  private observers = new Map<number, Observer>();
  private interceptors = new Map<number, Interceptor>();
  private postObserveCallbacks: Array<() => void> = [];
  private postInterceptCallbacks: Array<() => void> = [];
  waitingActions:Array<any> = [];

  constructor(
    initialDoc: {}, sessionId:string,
    topReducer: any,
    pluginCreators: Array<any> = []
  ) {
    const initialState = {
      doc: {
        sid:sessionId,
        state: initialDoc,
        patches: [],
        localCommands:[],
        undoRedoIndex:-1,
        hasRedo:false,
        hasUndo:false,
        undoRedoCommandsList: [],
        confirmedCommands: [],
        commands:{},
        remoteState:initialDoc
      }
    };

    const pluginNames: Array<string> = [];
    this.plugins = pluginCreators.map(pluginCreator => {
      const plugin = pluginCreator(this);
      if (pluginNames.find(pName => pName === plugin.name)) {
        throw new Error(`SyncState plugin named ${plugin.name} already exists! You can override plugin name
by passing name in plugin configuration to createPlugin.
        createStore({}, [
          myPlugin.createPlugin({
            name: "myOtherPlugin"
          })
        ])`);
      }

      pluginNames.push(plugin.name);
      return plugin;
    });

    // const reducers: any = {};

    // this.plugins.forEach(p => {
    //   if (p.reducer) {
    //     reducers[p.reducer.name] = p.reducer.reducer;
    //   }
    // });

    // const combinedReducer: any = combineReducers(reducers);

    // function rootReducer(state: any, action: any) {
    //   const intermediateState = combinedReducer(state, action);
    //   const finalState = topReducer(intermediateState, action);
    //   return finalState;
    // }
    // console.log(reducers, 'reducers');

    const composeEnhancers =
      typeof window === 'object' &&
      process.env.NODE_ENV !== 'production' &&
      (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
        ? (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
            // Specify extension’s options like name, actionsBlacklist, actionsCreators, serialize...
          })
        : compose;

    this.reduxStore = createStore(
      topReducer,
      initialState,
      composeEnhancers(
        applyMiddleware(
          createInterceptMiddleware(this.interceptors),
          createObserveMiddleware(this.observers),
          createPostInterceptMiddleware(this.postInterceptCallbacks),
          createPostObserveMiddleware(this.postObserveCallbacks),
          ...this.plugins.map(p => p.middleware)
        )
      )
    );
    this.subscribe = this.reduxStore.subscribe;

    this.plugins.forEach(plugin => {
      this.reduxStore.dispatch({
        type: 'CREATE_SUBTREE',
        payload: {
          subtree: plugin.name,
          initialState: plugin.initialState,
        },
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      // @ts-ignore
      window['store'] = this;
    }
  }



  dispatch(action:any){
    if(action.payload) {
      let subtree = this.reduxStore.getState()[action.payload.subtree];
      if(action.origin != "remote" && action.sid == null){
        action.sid = subtree.sid;
        action.uid = subtree.uid;
      }
      if (action.type == "REBASE") {
        let commands = action.payload.commands;
        if (this.rebaseCommandId && commands) {
          let newCommands = [];
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.payload.id == this.rebaseCommandId) {
              break;
            }
            newCommands.push(command);
          }
          action.payload.commands = newCommands;
        }
        this.reduxStore.dispatch(action)
      } else {
        if (subtree == null || !subtree.inited || action.origin == "remote") {
          if (this.rebaseInProgressObserver) {
            this.waitingActions.push(action);
          } else {
            if (subtree == null || !subtree.inited) {
              this.waitingActions.push(action);
              this.startRebaseInProgress(action.payload.subtree);
            } else if (rebaseNeeded(subtree.snapshotId, action)) {
              this.waitingActions.push(action);
              this.rebaseCommandId = action.payload.id;
              this.reduxStore.dispatch({type: "REBASE_NEEDED", payload: {snapshotId: action.payload.snapshotId}})
              this.startRebaseInProgress(action.payload.subtree);
            } else {
              this.reduxStore.dispatch(action)
            }
          }
        } else {
          this.reduxStore.dispatch(action)
        }
      }
    }
    else{
      this.reduxStore.dispatch(action)
    }
  }

  startRebaseInProgress(subtree:any){
    this.rebaseInProgressObserver = this.observe(subtree, "/", (value, change)=>{
      if(change.type == "REBASE"){
        this.rebaseInProgressObserver();
        this.rebaseInProgressObserver = null;
        this.waitingActions.forEach(action=>{
          this.reduxStore.dispatch(action)
        })
        this.waitingActions = [];
      }
    })
  }

  getState = (subtree: string) => {
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return undefined;
    }
    return subtreeState.state;
  };

  hasUndo(subtree:string){
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return false;
    }
    return subtreeState.hasUndo
  }

  hasRedo(subtree:string){
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return false;
    }
    return subtreeState.hasRedo
  }
  undo(subtree:string){
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return null;
    }
    let command = null;
    if(subtreeState.hasUndo){
      command = subtreeState.undoRedoCommandsList[subtreeState.undoRedoIndex];
      this.dispatch({type: "UNDO", payload:{subtree: subtree, commandId:subtreeState.undoRedoCommandsList[subtreeState.undoRedoIndex]}})
    }
    return command;
  };

  redo(subtree:string){
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return null;
    }
    let command = null;
    if(subtreeState.hasRedo){
      command = subtreeState.undoRedoCommandsList[subtreeState.undoRedoIndex+1];
      this.dispatch({type: "REDO", payload:{subtree: subtree, commandId:command}})
    }
    return command
  };

  getLocalCommands = (subtree: string) => {
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return undefined;
    }
    return subtreeState.localCommands.map((commandId:string)=>{
      return subtreeState.commands[commandId];
    });
  };
  getStateAtPath = (subtree: string, path: string) => {
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return undefined;
    }

    const state = subtreeState.state;
    if (!path || path === "") {
      return state;
    }
    return get(state, jsonPatchPathToImmerPath(path));
    // let newState = get(state, jsonPatchPathToImmerPath(path))
    // if(!newState) return newState;
    // return JSON.parse(JSON.stringify(newState));
  };
  getPatches = (subtree: string) => {
    const subtreeState = this.reduxStore.getState()[subtree];
    if (!subtreeState) {
      console.warn(`Tried to access non-existent subtree ${subtree}`);
      return undefined;
    }

    return subtreeState.patches;
  };
  observe = (
    subtree: string,
    path: string = '',
    callback: (value: any, change: any) => void,
    depth: number = 1
  ) => {
    const observerId = getNextId();

    // If observe is called inside observe callback or intercept callback, it causes an infinite loop
    // Adding this new observer in postObserveMiddleware fixes that but postObserveMiddleware is
    // not triggered when observe is called directly because it is not a Redux action.
    // Hence, the following dummy dispatch
    this.postObserve(() => {
      const newLength = this.observers.set(observerId, {
        subtree,
        path,
        callback,
        depth,
      });
    });

    this.dispatch({
      type:
        'dummy action to trigger postObserve Middleware when observe is not called inside an observe callback',
    });
    // The above

    return () => {
      this.observers.delete(observerId);
      // console.log('$$$$$removing observer with id ', observerId);
    };
  };

  intercept = (
    subtree: string,
    path: string = '',
    callback: (value: any, change: any) => any,
    depth: number = 1
  ) => {
    const interceptorId = getNextId();

    // If intercept is called inside intercept callback or intercept callback, it causes an infinite loop
    // Adding this new interceptor in postInterceptMiddleware fixes that but postInterceptMiddleware is
    // not triggered when intercept is called directly because it is not a Redux action.
    // Hence, the following dummy dispatch
    this.postIntercept(() => {
      const newLength = this.interceptors.set(interceptorId, {
        subtree,
        path,
        callback,
        depth,
      });
    });
    this.dispatch({
      type:
        'dummy action to trigger postIntercept Middleware when intercept is not called inside an intercept callback',
    });

    return () => {
      this.interceptors.delete(interceptorId);
    };
  };

  postObserve = (callback: () => void) => {
    this.postObserveCallbacks.push(callback);
  };
  postIntercept = (callback: () => void) => {
    this.postInterceptCallbacks.push(callback);
  };

  useSyncState = (subtree: string, path: string = '') =>
    useSyncState(this, subtree, path);
  useDoc = (path: string = '') => useSyncState(this, 'doc', path);

  computeDoc = (computeCallback: ComputeCallback) => {
    return this.compute('doc', computeCallback);
  };

  compute = (subtree: string, computeCallback: ComputeCallback) => {
    let oldDispose: any;
    const watch: Watch = (
      watchPath: string,
      depth: number = 1,
      firstWatch: boolean = false
    ) => {
      if (oldDispose) {
        oldDispose();
      }

      if (!firstWatch) {
        this.postObserve(() => {
          // postObserve bcoz otherwise a new observer gets added to the end of the array when calling
          // a previous observer leading to an infinite loop
          // console.log('$$$$compute observer 1');
          const dispose = this.observe(
            subtree,
            watchPath,
            (updatedValue, change) => {
              oldDispose = dispose;
              computeCallback(getValue, change);
            },
            depth
          );
        });
      } else {
        // console.log('$$$$compute observer 2');
        const dispose = this.observe(
          subtree,
          watchPath,
          (updatedValue, change) => {
            oldDispose = dispose;
            computeCallback(getValue, change);
          },
          depth
        );
      }

      // return dispose;
    };

    const getValue = (
      path: string,
      depth: number = 1,
      firstRun: boolean = false
    ) => {
      watch(path, depth, firstRun);
      const [doc, setDoc] = this.useSyncState(subtree, path);
      return doc;
    };

    computeCallback(
      (path: string, depth: number = 1) => getValue(path, depth, true),
      {}
    );

    return () => {
      if (oldDispose) {
        oldDispose();
      }
    };
  };
}
