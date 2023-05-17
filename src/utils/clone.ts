/* eslint-disable */
import {keys} from "lodash";

export default function clone(obj:any):any{
  let isArray = Array.isArray;
  if (!obj) return obj;
  if (isArray(obj)) {
    let arr = [];
    let length = obj.length;
    for (let i = 0; i < length; i++) arr.push(clone(obj[i]))
    return arr;
  } else if (typeof obj === 'object') {
    let entries = Object.entries(obj);
    let newObject:any = {};
    entries.forEach(([key, value])=>{
      newObject[key] = clone(value);
    })
    return newObject;
  }
  return obj;
}