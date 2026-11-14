/* Open in Val Town: https://www.val.town/x/mosabomer/bahith-bulk-domain-research/code/worker.ts */
import { cycle } from "./core.ts";
export default async function(_interval?: unknown){
  const result=await cycle();
  console.log(JSON.stringify(result));
  return result;
}