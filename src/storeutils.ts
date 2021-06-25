import { v4 as uuidv4 } from "uuid";
import {applyOperation, applyPatch, applyReducer} from 'fast-json-patch';
function createPatches(patches:any){
  return patches;
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
export function topReducer(state: any, action: any) {
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
      subtree.confirmedCommands.forEach((confirmedCommandId:any)=>{
        let command = subtree.commands[confirmedCommandId];
        if(command) {
          let patches = createPatches(command.payload.patches);
          subtree.remoteState = applyPatch(subtree.remoteState, patches, false, false).newDocument
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
      if(action.origin == "remote"){
        console.log("localaction", action);
        let newRemoteState = applyPatch(subtree.remoteState, patches, false, false).newDocument;
        subtree.confirmedCommands.push(action.payload.id);
        let existingCommand = getOrAddCommand(subtree, action)
        existingCommand.confirmed = true;
        let notifyLocalState = existingCommand.origin != "local";
        subtree.commands[action.payload.id] = existingCommand
        if(notifyLocalState) {
          let newLocalState = subtree.remoteState;
          let allPatches: any[] = patches;
          subtree.localCommands.forEach((localCommandId: any) => {
            let localCommand = subtree.commands[localCommandId];
            if (localCommand && !localCommand.confirmed) {
              if (!localCommand.skipped) {
                let localPatches = createPatches(localCommand.payload.patches);
                newLocalState = applyPatch(newLocalState, localPatches, false, false).newDocument;
                allPatches.splice(allPatches.length, 0, localPatches)
              }
            }
          })
          // @ts-ignore

          action.payload.patches = allPatches;
          subtree.state = newLocalState;
        }
        else{
          markNotConfirmedLocalAsConfirmed(subtree);
          action.type = "LOCALECHO"
        }
        subtree.remoteState = newRemoteState;
      }
      else {
        subtree.state = applyPatch(subtree.state, patches, false, false).newDocument
        subtree.localCommands.push(action.payload.id);
        action.origin = "local"
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
        let initialRemoteState = subtree.initialRemoteState;
        subtree.confirmedCommands.forEach((command:any)=>{
          if(!command.skipped && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.payload.patches));
            initialRemoteState = applyPatch(initialRemoteState, createPatches(command.payload.patches), false, false).newDocument;
          }
        })

        subtree.remoteState = initialRemoteState

        let initialState = subtree.initialState;
        subtree.localCommands.forEach((command:any)=>{
          if(!command.confirmed && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length,0, createPatches(command.payload.patches));
            initialState = applyPatch(initialState, createPatches(command.payload.patches), false, false).newDocument;
          }
        })
        subtree.state = initialState;

        action.payload.patches = allPatches;
        action.type = "PATCHES";
      }
      return state;
    }
    case 'CREATE_SUBTREE': {
      state[action.payload.subtree] = {
        state: action.payload.initialState,
        localCommands: [],
        confirmedCommands: [],
        commands:{},
        remoteState:action.payload.initialState
      };
      return state;
    }

    default:
      return state;
  }
}