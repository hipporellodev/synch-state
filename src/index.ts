import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';
import DocStore from './DocStore';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';
import {topReducer} from "./storeutils";

export function createDocStore(initialDoc: {}, plugins?: Array<any>) {
  const docStore = new DocStore(initialDoc, topReducer, plugins);

  return docStore;
}

export type SyncStatePath = Array<string | number>;
export { DocStore, jsonPatchPathToImmerPath, immerPathToJsonPatchPath };
export * from './types';
export {localApplyPatches} from "./storeutils"
