export default function rebaseNeeded(rebaseSnapshotId:string, action:any){
  if(action.type == "UNDO" || action.type == "REDO"){
    if(rebaseSnapshotId != null && rebaseSnapshotId > action.payload.snapshotId){
      return true;
    }
  }
  return false;
}