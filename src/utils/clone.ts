import {copy} from 'fastest-json-copy';
export default function clone(data){
  if(!data) return null;
  return copy(data)
}