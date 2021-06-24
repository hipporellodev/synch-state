import unescapeSlashes from './unescapeSlashes';

export default function jsonPatchPathToImmerPath(path: string) {
  if (!path) {
    return [];
  }

  let split = path.split('/');
  split.shift();
  return split;
}
