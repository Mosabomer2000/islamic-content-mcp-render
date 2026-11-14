import { cycle } from "./core.js";
export default async function (_interval) {
    const result = await cycle();
    console.log(JSON.stringify(result));
    return result;
}
