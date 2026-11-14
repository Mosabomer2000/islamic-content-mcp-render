import { getDocument, OPS } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import jpeg from "npm:jpeg-js@0.4.4";
const pn = 59;
const raw = new Uint8Array(await (await fetch("https://files.quranpedia.net/attachments/documents/BOOK_21066_1.pdf")).arrayBuffer());
const doc = await getDocument({ data: raw, useSystemFonts: true, disableFontFace: true }).promise;
const p = await doc.getPage(pn), op = await p.getOperatorList(), i = op.fnArray.findIndex(x => x === OPS.paintImageXObject), src = p.objs.get(op.argsArray[i][0]);
const w = 1400, h = Math.round(src.height * w / src.width), out = new Uint8Array(w * h * 4);
const stride = Math.ceil(src.width / 8);
for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const sy = Math.floor(y * src.height / h), sx = Math.floor(x * src.width / w), bi = sy * stride + (sx >> 3), bit = (src.data[bi] >> (7 - (sx & 7))) & 1, vl = bit ? 255 : 0, k = (y * w + x) * 4;
        out[k] = out[k + 1] = out[k + 2] = vl;
        out[k + 3] = 255;
    }
const jpg = jpeg.encode({ data: out, width: w, height: h }, 72).data, enc = jpg.toString("base64");
console.log(JSON.stringify({ page: pn, srcW: src.width, srcH: src.height, stride, w, h, chunks: Math.ceil(enc.length / 6000) }));
for (let i = 0; i < enc.length; i += 6000)
    console.log("CHUNK:" + (i / 6000) + ":" + enc.slice(i, i + 6000));
