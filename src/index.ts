import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';
import DocStore from './DocStore';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';
import {topReducer} from "./storeutils";

export function createDocStore(initialDoc: {}, sessionId, plugins?: Array<any>) {
  const docStore = new DocStore(initialDoc, sessionId, topReducer, plugins);

  return docStore;
}

export type SyncStatePath = Array<string | number>;
export { DocStore, jsonPatchPathToImmerPath, immerPathToJsonPatchPath };
export * from './types';
export {localApplyPatches} from "./storeutils"
