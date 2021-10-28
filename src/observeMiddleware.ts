import get from 'lodash.get';
import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';

export type Observer = {
  subtree: string;
  path: string;
  callback: (value: any, change: any) => void;
  depth: number;
};

export const createObserveMiddleware = (observers: Map<number, Observer>) => {
  return (store: any) => (next: any) => (action: any) => {
    const result = next(action);

    if (action.type === 'PATCHES' || action.type === "REBASE") {
      const patches = action.type === "REBASE"? [action.payload] : action.payload?.patches
      observers.forEach((observer, key) => {
        let foundAction = patches.find((patch:any)=>{
          let willLog = !observer.path.startsWith("/local") && !patch.path.startsWith("/local");
          if(willLog){
            console.log("PATCHES1", patch, observer.path)
          }
          const payloadPath = patch.path;

          if (payloadPath == null || observer.subtree !== action.payload.subtree || observer.depth < 0) {
            // Skip this observer if observer and action.payload subtrees do not match
            if(willLog){
              console.log("PATCHES1.1", false)
            }
            return false;
          }

          // If path above the observer path changes call observer for all cases
          if (observer.path.startsWith(payloadPath)) {
            if(willLog){
              console.log("PATCHES1.2", true)
            }
            return true;
          }

          // If depth x, call for x levels extra below observer path
          else if (observer.depth > 0 && observer.depth !== Infinity) {
            if(willLog){
              console.log("PATCHES1.3")
            }
            const matchingLengthPayloadPathArray = jsonPatchPathToImmerPath(
                payloadPath
            ).slice(0, jsonPatchPathToImmerPath(observer.path).length);
            const remainingPayloadPathLength =
                jsonPatchPathToImmerPath(payloadPath).length -
                matchingLengthPayloadPathArray.length;

            if (
                immerPathToJsonPatchPath(matchingLengthPayloadPathArray) ===
                observer.path &&
                remainingPayloadPathLength <= observer.depth
            ) {
              return true;
            }
          }

          //If depth is infinity, call for any number of levels below observer path
          else if (observer.depth === Infinity) {
            if(willLog){
              console.log("PATCHES1.4")
            }
            if (payloadPath.startsWith(observer.path)) {
              return true;
            }
          }
          if(willLog){
            console.log("PATCHES1.7")
          }
          return false;
        })

        if(foundAction){
          if(!observer.path.startsWith("/local")){
            console.log("PATCHES2", patches, observer.path);
          }
          callObserver(observer, store, action);
        }

      });
    }
    else if(action.type == "REBASE_NEEDED" || action.type == "REDO" || action.type == "UNDO"){
      observers.forEach((observer, key) => {
        callObserver(observer, store, action);
      });
    }

    return result;
  };
};
function callObserver(observer: any, store: any, action: any) {
  observer.callback(
    get(
      store.getState()[observer.subtree],
      'state' + observer.path.replaceAll('/', '.')
    ),
    action
  );
}
