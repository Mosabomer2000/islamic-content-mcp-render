import { cycle } from "./core.ts";
export default async function(_interval?: unknown){
  const result=await cycle();
  console.log(JSON.stringify(result));
  return result;
}