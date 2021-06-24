import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';
import { v4 as uuidv4 } from "uuid";
import DocStore from './DocStore';
import * as jsonpatch from 'fast-json-patch';
import {applyOperation, applyReducer} from 'fast-json-patch';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';
import {topReducer} from "./storeutils";


export function createDocStore(initialDoc: {}, plugins?: Array<any>) {
  const docStore = new DocStore(initialDoc, topReducer, plugins);

  return docStore;
}

export type SyncStatePath = Array<string | number>;
export { DocStore, jsonPatchPathToImmerPath, immerPathToJsonPatchPath };
export * from './types';
