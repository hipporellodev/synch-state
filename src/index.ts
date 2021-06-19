import {
  produce,
  applyPatches,
  produceWithPatches,
  enablePatches,
} from 'immer';
import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';

import DocStore from './DocStore';
import jsonPatchPathToImmerPath from './utils/jsonPatchPathToImmerPath';
enablePatches();
function createPatches(patches:any){
  return patches.map((patchCommand:any)=>{
    return {
      ...patchCommand,
      path: jsonPatchPathToImmerPath(patchCommand.path),
    }
  })
}
function topReducer(state: any, action: any) {
  switch (action.type) {
    case 'PATCHES': {
      let subtree = state[action.payload.subtree];
      let patches = createPatches(action.payload.patches);
      subtree.state = applyPatches(
          subtree.state,
          patches
      );
      subtree.localCommands.push(action.payload.id);
      subtree.commands[action.payload.id] = {
        patches: action.payload.patches,
        subtree: action.payload.subtree,
        id: action.payload.id,
        sent:false,
        type: action.type,
        local:true,
        confirmed:false,
        skipped:false,
        inversePatches: action.payload.inversePatches,
      }
      return state;
    }
    case 'REDO':
    case 'UNDO': {
      let subtree = state[action.payload.subtree];
      let reversedCommandId = action.payload.command
      let command = subtree.commands[reversedCommandId]
      if(command){
        command.skipped = action.type == 'UNDO';
        let allPatches:any[] = []
        subtree.confirmedCommands.forEach((command:any)=>{
          if(!command.skipped && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.patches));
          }
        })

        subtree.remoteState = applyPatches(subtree.initialRemoteState, allPatches);

        subtree.localCommands.forEach((command:any)=>{
          if(!command.confirmed && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.patches));
          }
        })
        let currentLocalState = subtree.state;
        subtree.state = applyPatches(subtree.initialState, allPatches);
        // @ts-ignore
        const [documentAtPath, compressedPatches, inversePatches] = produceWithPatches(currentLocalState, (compressedDraft: any) => {
          return subtree.state;
        })
        action.patches = compressedPatches;
        action.type = "PATCHES";
      }
      return state;
    }
    case 'REMOTE_PATCHES': {

      let subtree = state[action.payload.subtree];
      let patches = createPatches(action.payload.patches);


      let newRemoteState = applyPatches(
          subtree.remoteState,
          patches
      );

      subtree.confirmedCommands.push(action.payload.id);
      let existingCommand = subtree.commands[action.payload.id];
      let notifyLocalState = false;
      if(existingCommand == null){
        existingCommand = {
          patches: action.payload.patches,
          subtree: action.payload.subtree,
          id: action.payload.id,
          type: action.type,
          local:false,
          skipped:false,
          inversePatches: action.payload.inversePatches,
        }
      }
      existingCommand.confirmed = true;
      subtree.commands[action.payload.id] = existingCommand
      if(notifyLocalState) {
        let allPatches: any[] = patches;
        subtree.localCommands.forEach((localCommand: any) => {
          if (!localCommand.confirmed) {
            if (!localCommand.skipped) {
              let localPatches = createPatches(localCommand.patches);
              allPatches.splice(allPatches.length, 0, localPatches)
            }
          }
        })
        let newLocalState = applyPatches(
            subtree.remoteState,
            allPatches
        );
        // @ts-ignore
        const [documentAtPath, compressedPatches, inversePatches] = produceWithPatches(subtree.state, (compressedDraft: any) => {
          return newLocalState;
        })
        action.payload.patches = compressedPatches;
        action.type = "PATCHES";
        subtree.state = newLocalState;
      }
      subtree.remoteState = newRemoteState;
      return state;
    }
    case 'CREATE_SUBTREE': {
      return produce(state, (draftState: any) => {
        draftState[action.payload.subtree] = {
          state: action.payload.initialState,
          localCommands: [],
          confirmedCommands: [],
          commands:{},
          remoteState:action.payload.initialState
        };
      });
    }

    default:
      return state;
  }
}

export function createDocStore(initialDoc: {}, plugins?: Array<any>) {
  const docStore = new DocStore(initialDoc, topReducer, plugins);

  return docStore;
}

export type SyncStatePath = Array<string | number>;
export { DocStore, jsonPatchPathToImmerPath, immerPathToJsonPatchPath };
export * from './types';
