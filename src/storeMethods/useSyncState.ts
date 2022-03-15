import DocStore from '../DocStore';
import { SyncStatePath } from '../index';
import jsonPatchPathToImmerPath from '../utils/jsonPatchPathToImmerPath';
import immerPathToJsonPatchPath from '../utils/immerPathToJsonPatchPath';
import {compare} from "fast-json-patch";
import {isNumber} from "storeutils";
import get from 'lodash/get';

export default function useSyncState(
    store: DocStore,
    subtree: string,
    path: string
) {
  let stateAtPath = store.getStateAtPath(subtree, path);

  return [
    stateAtPath,
    (callbackOrData: any) => {
      let newPath = path; // Avoid mutating the closure value of path
      // Do NOT use above stateAtPath, if you do, you get stale value in the closure if you are reusing this setter callback
      let value = callbackOrData;
      if (typeof callbackOrData === 'function') {
        value = JSON.parse(JSON.stringify(store.getStateAtPath(subtree, path)));
        callbackOrData(value)
      }


      // replace the received value in its parent
      // let parentPath = [...path];
      const immerPath = jsonPatchPathToImmerPath(newPath);
      const childKey = immerPath.pop();
      newPath = immerPathToJsonPatchPath(immerPath); // immerPath.join('/');
      let stateAtPath = JSON.parse(JSON.stringify(store.getStateAtPath(subtree, newPath)));
      let cmd = JSON.parse(JSON.stringify(store.getStateAtPath(subtree, newPath)));
      // @ts-ignore
      cmd[childKey] = value;
      // @ts-ignore
      let patches = compare(stateAtPath, cmd);

      let minPaths:any = {};

      patches.forEach((p) => {
        console.log(p.path)
        let parts = p.path.split("/")
        let minPath = [];
        for(let i=0; i < parts.length; i++){
          if(parts[i] !== "" && isNumber(parts[i])){
            break;
          }
          minPath.push(parts[i]);
        }
        minPaths[minPath.join("/")] = true;
      })

      console.log(minPaths)
      patches = Object.keys(minPaths).map(minPath=>{
        let pathVal = get(value, jsonPatchPathToImmerPath(minPath));
        return {op:"replace", path:newPath+minPath, value:pathVal}
      })

      store.dispatch({
        type: 'PATCHES',
        payload: { patches, subtree },
      });

      // store.dispatch({
      //   type: 'PATCHES',
      //   payload: patches.map((patch: any, index: number) => ({
      //     patch: patch,
      //     inversePatch: inversePatches[index],
      //   })),
      // });
    },
    store.dispatch,
  ];
}
