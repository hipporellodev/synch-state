import { Patch, produceWithPatches } from 'immer';
import DocStore from '../DocStore';
import { SyncStatePath } from '../index';
import jsonPatchPathToImmerPath from '../utils/jsonPatchPathToImmerPath';
import immerPathToJsonPatchPath from '../utils/immerPathToJsonPatchPath';

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
      let stateAtPath = store.getStateAtPath(subtree, newPath);
      let replaceValue = false;
      if (typeof callbackOrData !== 'function') {
        // throw new Error(
        //   'Received an object. Expecting a callback function which receives the object you want to modify.'
        // );
        replaceValue = true;
      }

      let produceCallback = (draft: any) => {
        callbackOrData(draft);
      };

      if (replaceValue) {
        // replace the received value in its parent
        // let parentPath = [...path];
        const immerPath = jsonPatchPathToImmerPath(newPath);
        const childKey = immerPath.pop();
        newPath = immerPathToJsonPatchPath(immerPath); // immerPath.join('/');
        stateAtPath = store.getStateAtPath(subtree, newPath);
        produceCallback = (draft: any) => {
          if (childKey) {
            draft[childKey] = callbackOrData;
          } else {
            // if root path
            throw new Error('Cannot replace root doc');
          }
        };
      }
      // @ts-ignore
      let [nextState, patches, inversePatches] = produceWithPatches(
        stateAtPath,
        produceCallback
      );
      // console.log(path, 'path');
      // console.log(JSON.stringify(patches, null, 2), 'patches before');
      patches = patches.map((p: Patch) => {
        return {
          ...p,
          path: newPath + immerPathToJsonPatchPath(p.path),
        };
      });

      inversePatches = inversePatches.map((p: any) => {
        return { ...p, path: newPath + immerPathToJsonPatchPath(p.path) };
      });
      // console.log(JSON.stringify(patches, null, 2), 'patches');

      // patches.forEach((patch: any, index: number) => {
      //
      // });

      store.dispatch({
        type: 'PATCHES',
        payload: { patches, inversePatches, subtree },
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
