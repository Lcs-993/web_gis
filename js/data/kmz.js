/* ============================================================
   KMZ → texto KML

   KMZ é um ZIP com um KML dentro (por convenção doc.kml na raiz)
   e, às vezes, ícones e imagens. Aqui só o KML interessa.

   Leitura do ZIP sem bibliotecas: diretório central (fim do
   arquivo) → cabeçalho local → dados. Compressão "store" (0) é
   copiada; "deflate" (8) é aberta com DecompressionStream
   ("deflate-raw"), nativo dos navegadores atuais.
   ============================================================ */

import { decodeXml } from "./kml.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const decodeName = (bytes, utf8) => new TextDecoder(utf8 ? "utf-8" : "latin1").decode(bytes);

/* End of Central Directory: últimos 22 bytes + comentário de até 64 KB. */
function findEndOfCentralDirectory(view) {
    const minimum = Math.max(0, view.byteLength - 22 - 0xffff);

    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
        if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
            return offset;
        }
    }

    return -1;
}

function listEntries(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const end = findEndOfCentralDirectory(view);

    if (end === -1) {
        throw new Error("O arquivo KMZ não é um ZIP válido.");
    }

    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const entries = [];

    for (let index = 0; index < count; index += 1) {
        if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
            throw new Error("O índice do arquivo KMZ está corrompido.");
        }

        const flags = view.getUint16(offset + 8, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);

        entries.push({
            name: decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength), Boolean(flags & 0x0800)),
            encrypted: Boolean(flags & 0x0001),
            method: view.getUint16(offset + 10, true),
            compressedSize: view.getUint32(offset + 20, true),
            localOffset: view.getUint32(offset + 42, true)
        });

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return { view, bytes, entries };
}

async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("Este navegador não consegue abrir KMZ compactado. Extraia o KML e abra-o diretamente.");
    }

    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));

    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry({ view, bytes }, entry) {
    if (entry.encrypted) {
        throw new Error("O arquivo KMZ está protegido por senha.");
    }

    const offset = entry.localOffset;

    if (view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
        throw new Error("O arquivo KMZ está corrompido.");
    }

    /* O tamanho do nome/extra do cabeçalho local pode diferir do diretório central. */
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);

    if (entry.method === 0) {
        return data;
    }

    if (entry.method === 8) {
        return inflateRaw(data);
    }

    throw new Error(`Compressão não suportada no KMZ (método ${entry.method}).`);
}

/* Devolve o texto do KML principal: doc.kml na raiz; senão o primeiro .kml (mais raso). */
export async function kmzToKml(buffer) {
    const archive = listEntries(buffer);

    const kmls = archive.entries
        .filter((entry) => /\.kml$/i.test(entry.name) && !entry.name.endsWith("/"))
        .sort((a, b) => a.name.split("/").length - b.name.split("/").length);

    const main = kmls.find((entry) => entry.name.toLowerCase() === "doc.kml") || kmls[0];

    if (!main) {
        throw new Error("Nenhum arquivo KML encontrado dentro do KMZ.");
    }

    return decodeXml(await readEntry(archive, main));
}
