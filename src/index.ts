import {
  produce,
  applyPatches,
  produceWithPatches,
  enablePatches,
} from 'immer';
import immerPathToJsonPatchPath from './utils/immerPathToJsonPatchPath';
import { v4 as uuidv4 } from "uuid";
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
function markNotConfirmedLocalAsConfirmed(subtree:any){
  let confirmed = false;

  for(let i=subtree.localCommands.length-1; i>= 0; i--){
    let localCommand = subtree.commands[subtree.localCommands[i]];
    if(localCommand.confirmed){
      confirmed = true;
    }
    localCommand.confirmed = confirmed;
  }
}
function alreadyApplied(subtree:any, command:any){
  let existingCommand = subtree.commands[command.payload.id]
  return existingCommand != null && existingCommand.confirmed;
}
function getOrAddCommand(subtree:any, command:any){
  let existingCommand = subtree.commands[command.payload.id];
  if(existingCommand == null){
    existingCommand = {
      payload:{...command.payload},
      type:command.type,
      origin:command.origin,
      skipped:false
    }
    subtree.commands[command.payload.id] = existingCommand;
  }
  return existingCommand;
}
function topReducer(state: any, action: any) {
  switch (action.type) {
    case 'INIT':
    case 'REBASE': {
      let subtree = state[action.payload.subtree];
      subtree.initialRemoteState = action.payload.data;
      subtree.remoteState = action.payload.data
      let newCommandIds:any[] = [];
      let commands = subtree.commands;
      if(action.payload.commands) {
        action.payload.commands.forEach((command: any) => {
          let existingCommand = getOrAddCommand(subtree, command);
          existingCommand.confirmed = true;
          if (command.type == "UNDO" || command.type == "REDO") {
            let undoRedoCmd = commands[command.payload.commandId]
            if (undoRedoCmd) {
              undoRedoCmd.skipped = command.type == "UNDO"
            }
          }
          newCommandIds.push(command.payload.id);
        })
      }
      subtree.confirmedCommands = newCommandIds;
      console.log("confirmedCommands", subtree.confirmedCommands, subtree.commands)
      subtree.confirmedCommands.forEach((confirmedCommandId:any)=>{
        let command = subtree.commands[confirmedCommandId];
        if(command) {
          let patches = createPatches(command.payload.patches);
          subtree.remoteState = applyPatches(subtree.remoteState, patches)
        }
      })
      markNotConfirmedLocalAsConfirmed(subtree);
      if(action.type == "INIT"){
        subtree.state = subtree.remoteState;
      }
      return state;
    }
    case 'PATCHES': {
      if(action.payload.id == null){
        action.payload.id = uuidv4();
      }
      let subtree = state[action.payload.subtree];
      //already applied
      if(alreadyApplied(subtree, action)) return;
      let patches = createPatches(action.payload.patches);
      if(action.payload.origin == "remote"){
        let newRemoteState = applyPatches(subtree.remoteState, patches);
        subtree.confirmedCommands.push(action.payload.id);
        let existingCommand = getOrAddCommand(subtree, action)
        existingCommand.confirmed = true;
        let notifyLocalState = existingCommand.origin != "local";
        subtree.commands[action.payload.id] = existingCommand
        if(notifyLocalState) {
          let allPatches: any[] = patches;
          subtree.localCommands.forEach((localCommand: any) => {
            if (!localCommand.confirmed) {
              if (!localCommand.skipped) {
                let localPatches = createPatches(localCommand.payload.patches);
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
          subtree.state = newLocalState;
        }
        else{
          markNotConfirmedLocalAsConfirmed(subtree);
          action.type = "LOCALECHO"
        }
        subtree.remoteState = newRemoteState;
      }
      else {
        subtree.state = applyPatches(
            subtree.state,
            patches
        );
        subtree.localCommands.push(action.payload.id);
        getOrAddCommand(subtree, action);
      }
      return state;
    }
    case 'REDO':
    case 'UNDO': {
      if(action.payload.id == null){
        action.payload.id = uuidv4();
      }
      let subtree = state[action.payload.subtree];
      if(alreadyApplied(subtree, action)) return;
      let reversedCommandId = action.payload.commandId
      let command = subtree.commands[reversedCommandId]
      subtree.confirmedCommands.push(action.payload.id)
      subtree.commands.push(action.payload.id)
      if(command){
        command.skipped = action.type == 'UNDO';
        let allPatches:any[] = []
        subtree.confirmedCommands.forEach((command:any)=>{
          if(!command.skipped && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.payload.patches));
          }
        })

        subtree.remoteState = applyPatches(subtree.initialRemoteState, allPatches);

        subtree.localCommands.forEach((command:any)=>{
          if(!command.confirmed && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.payload.patches));
          }
        })
        let currentLocalState = subtree.state;
        subtree.state = applyPatches(subtree.initialState, allPatches);
        // @ts-ignore
        const [documentAtPath, compressedPatches, inversePatches] = produceWithPatches(currentLocalState, (compressedDraft: any) => {
          return subtree.state;
        })
        action.payload.patches = compressedPatches;
        action.type = "PATCHES";
      }
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
