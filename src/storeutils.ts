import { v4 as uuidv4 } from "uuid";
import {applyPatch} from 'fast-json-patch';
import rebaseNeeded from "./utils/rebaseNeeded";
import isEqual from "lodash/isEqual"
import clone from "utils/clone";
const  number_reg_exp = /^\d+$/;
function validatePath(patches:any){
  patches.forEach((patch:any)=>{
    let path = patch.path;
    let parts = path.split("/")
    let found = parts.find((prt:any)=>{
      return number_reg_exp.test(prt)
    })
    if(found){
      throw new Error("Invalid path "+path+ " patches:"+JSON.stringify(patches))
    }
  })

}
function createPatches(patches:any){
  if(patches == null){
    return [];
  }
  patches = patches.filter((patch:any)=>{
    return patch != null && patch.path
  })
  patches = patches.map((patch:any)=>{
    if(patch.op == "replace" && (patch.value == null
      || (typeof (patch.value) == "object" && Object.keys(patch.value).length === 0))
      || (Array.isArray(patch.value) && patch.value?.length === 0)
    ){
      return {op:"remove", path:patch.path}
    }
    return patch;
  })
  validatePath(patches)
  return patches;
}
function isNumber(num:any){
  return !isNaN(parseFloat(num)) && isFinite(num);
}
function updateUndoRedoIndex(state:any, newIndex:number){
  if(newIndex < 0){
    newIndex = -1;
  }
  state.undoRedoIndex = newIndex;
  state.hasUndo = state.undoRedoIndex >= 0;
  state.hasRedo = state.undoRedoCommandsList.length -1 > state.undoRedoIndex;
}
export function localApplyPatches(state:any, patches:Array<any>){
  if(!patches?.length) return state;
  patches.forEach(patch=>{
    try {
      state = applyPatch(state, [patch], false, false).newDocument
    }catch(e){
      if(patch.path){
        let tmpState = state;
        let paths = patch.path.split("/")
        for(let i =1; i < paths.length; i++){
          if(patch?.op === "add" && paths?.length - 1 === i) break;
          let path = paths[i];
          if(tmpState[path] == null){
            let obj:any = null;
            if(i+1 < paths.length && (paths[i+1] == "-" || isNumber(paths[i+1]))){
              obj = []
              if(paths[i+1] == "-"){
                i = i+1;
              }
            }
            else{
              obj = {}
            }
            tmpState[path] = obj;
            tmpState = obj;
          }
          else{
            tmpState = tmpState[path];
          }
        }
      }
      state = applyPatch(state, [patch], false, false).newDocument
    }
  })
  return state;
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
function applyRemainingLocalCommands(remoteState:any, localState:any, commandsRegistry:any, localCommands:any[]) {
  let newLocalState = {...localState, ...clone(remoteState)};
  let allPatches: any[] = [];
  localCommands.forEach((localCommandId: any) => {
    let localCommand = commandsRegistry[localCommandId];
    if (localCommand && !localCommand.confirmed) {
      if (!localCommand.skipped) {
        let localPatches = createPatches(localCommand.payload.patches);
        newLocalState = localApplyPatches(newLocalState, localPatches);
        allPatches.splice(allPatches.length, 0, ...localPatches)
      }
    }
  })
  // @ts-ignore

  return {patches:allPatches, state:newLocalState};
}
function getOrAddCommand(subtree:any, command:any){
  let existingCommand = subtree.commands[command.payload.id];
  if(existingCommand == null){
    command = clone(command);
    existingCommand = {
      payload:{...command.payload},
      type:command.type,
      sid:command.sid,
      origin:command.origin,
      uid:command.uid,
      skipped:false
    }
    subtree.commands[command.payload.id] = existingCommand;
  }

  return existingCommand;
}
export function topReducer(state: any, action: any) {
  switch (action.type) {
    case 'REBASE':
      {
      let subtree = state[action.payload.subtree];
      if(subtree.initialSnapshotId == null) {
        subtree.initialSnapshotId = action.payload.snapshotId;
      }
      let rebaseNeededSnapshotId = action.payload.snapshotId;
      if(action.payload.snapshotId != null) {
        action.payload.commands.forEach((command: any) => {
          if (rebaseNeeded(rebaseNeededSnapshotId, action)) {
              rebaseNeededSnapshotId = command.payload.snapshotId;
          }
        })
      }
      if(rebaseNeededSnapshotId != action.payload.snapshotId){
        action.type = "REBASE_NEEDED";
        action.payload = {snapshotId:rebaseNeededSnapshotId};
        return state;
      }


      let newCommands:any = {};
      if(subtree.localCommands != null && subtree.commands){
        subtree.localCommands.forEach((localCommandId:string)=>{
          let command = subtree.commands[localCommandId];
          if(command) {
            command.confirmed = false;
            newCommands[localCommandId] = command;
          }
        })
      }
      subtree.initialRemoteState = action.payload.data;
      subtree.remoteState = action.payload.data
      subtree.rebaseNeeded = null;
      subtree.commands = newCommands;
      subtree.snapshotId  = action.payload.snapshotId;
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
        if(command && !command.skipped) {
          let patches = createPatches(command.payload.patches);
          subtree.remoteState = localApplyPatches(subtree.remoteState, patches)
        }
      })
      markNotConfirmedLocalAsConfirmed(subtree);
      if(!subtree.inited){
        subtree.state = {...subtree.state, ...subtree.remoteState, inited:true};
        subtree.inited = true;
      }
      return state;
    }
    case 'PATCHES': {
      if(action.payload.patches == null || action.payload.patches.length == 0){
        action.type = "IGNORED";
        return state;
      }
      if(action.payload.id == null){
        action.payload.id = uuidv4();
      }
      let patches = createPatches(action.payload.patches);
      action.payload.patches = patches;
      let subtree = state[action.payload.subtree];
      //already applied
      if(alreadyApplied(subtree, action)) return;

      if(action.origin == "remote"){
        let newRemoteState = localApplyPatches(subtree.remoteState, patches);
        subtree.confirmedCommands.push(action.payload.id);
        let existingCommand = getOrAddCommand(subtree, action)
        existingCommand.confirmed = true;
        let notifyLocalState = existingCommand.sid != subtree.sid;
        subtree.commands[action.payload.id] = existingCommand
        markNotConfirmedLocalAsConfirmed(subtree);
        if (notifyLocalState) {
          let res = applyRemainingLocalCommands(newRemoteState, subtree.state, subtree.commands, subtree.localCommands);
          let allPatches = [...patches]
          allPatches.splice(allPatches.length, 0, ...res.patches)
          action.payload.patches = allPatches;
          subtree.state = res.state;
        } else {
          action.type = "LOCALECHO"
        }
        subtree.remoteState = newRemoteState;
      }
      else {
        let prevState = subtree.state?clone(subtree.state):null;
        let newState = localApplyPatches(subtree.state, patches)

        if(isEqual(prevState, newState)){
          action.type = "IGNORE"
          return state;
        }
        subtree.state = newState;
        let isApp = patches.find((patch:any)=>{
          return patch.path.startsWith("/app")
        })
        if(isApp) {
          subtree.localCommands.push(action.payload.id);
          getOrAddCommand(subtree, action);
          let undoToBeDeleted = subtree.undoRedoIndex+1;
          let undoRedoCommandsList = subtree.undoRedoCommandsList
          if(undoToBeDeleted < undoRedoCommandsList.length) {
            undoRedoCommandsList.splice(undoToBeDeleted, undoRedoCommandsList.length-undoToBeDeleted)
          }
          undoRedoCommandsList.push(action.payload.id)
          subtree.undoRedoCommandsList = undoRedoCommandsList;

          updateUndoRedoIndex(subtree, subtree.undoRedoCommandsList.length-1);
        }
        if(action.origin != "remote" && subtree.uid) {
          action.uid = subtree.uid
          action.sid = subtree.sid
        }

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
      if(action.origin != "remote"){
        action.payload.snapshotId = subtree.initialSnapshotId;
        if(action.origin != "remote" && subtree.uid) {
          action.uid = subtree.uid
          action.sid = subtree.sid
        }
        subtree.localCommands.push(action.payload.id);
        if(action.type == "UNDO"){
          if(subtree.hasUndo) {
            updateUndoRedoIndex(subtree, subtree.undoRedoIndex - 1);
          }
        }
        else{
          if(subtree.hasRedo) {
            updateUndoRedoIndex(subtree, subtree.undoRedoIndex + 1);
          }
        }
      }
      else{
        subtree.confirmedCommands.push(action.payload.id)
      }
      getOrAddCommand(subtree, action);
      let reversedCommandId = action.payload.commandId
      let command = subtree.commands[reversedCommandId]
      if(command){
        command.skipped = action.type == 'UNDO';
        let allPatches:any[] = []
        let initialRemoteState = subtree.initialRemoteState;
        subtree.confirmedCommands.forEach((commandId:any)=>{
          let command = subtree.commands[commandId];
          if(command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length, 0, ...createPatches(command.payload.patches));
          }
          if(!command.skipped && command.type != "UNDO" && command.type != "REDO"){
            initialRemoteState = localApplyPatches(initialRemoteState, createPatches(command.payload.patches));
          }
        })

        subtree.remoteState = initialRemoteState

        markNotConfirmedLocalAsConfirmed(subtree);
        let initialState = subtree.remoteState;
        subtree.localCommands.forEach((commandId:any)=>{
          let command = subtree.commands[commandId];
          if(!command.confirmed && command.type != "UNDO" && command.type != "REDO"){
            allPatches.splice(allPatches.length, 0, ...createPatches(command.payload.patches));
          }
          if (!command.skipped && command.type != "UNDO" && command.type != "REDO") {
            if (!command.confirmed) {
              initialState = localApplyPatches(initialState, createPatches(command.payload.patches));
            }
          }
        })
        subtree.state = {...subtree.state, ...initialState};
        let origAction = clone(action);
        action.payload.patches = allPatches;
        action.type = "PATCHES";
        action.sid = origAction.sid;
        action.uid = origAction.uid;
        action.origin = origAction.origin;
        action.origAction = origAction;
      }
      return state;
    }
    case 'INIT_SESSION':{
      let subtree = state[action.payload.subtree];
      subtree.uid = action.payload.uid;
      subtree.sid = action.payload.sid;
      return state;
    }
    case 'CREATE_SUBTREE': {
      let subTree = state[action.payload.subtree];
      state[action.payload.subtree] = {
        state: action.payload.initialState,
        localCommands: [],
        undoRedoIndex:-1,
        sid:subTree.sid,
        uid:subTree.uid,
        hasRedo:false,
        hasUndo:false,
        undoRedoCommandsList: [],
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
