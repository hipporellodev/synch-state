export default function clone(obj:any):any{
  let isArray = Array.isArray;
  if (!obj) return obj;
  if (isArray(obj)) {
    let arr = [];
    let length = obj.length;
    for (let i = 0; i < length; i++) arr.push(clone(obj[i]))
    return arr;
  } else if (typeof obj === 'object') {
    let keys = Object.keys(obj);
    let length = keys.length;
    let newObject = {};
    for (let i = 0; i < length; i++) {
      let key = keys[i];
      newObject[key] = clone(obj[key]);
    }
    return newObject;
  }
  return obj;
}