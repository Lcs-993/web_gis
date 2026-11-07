/* ============================================================
   EXPORTAR PNG — um card do Analytics (o gráfico) como imagem

   Monta uma "folha" fora da tela com o mesmo visual do card, na
   largura da tela, mais título, subtítulo e filtros, sem os
   controles e sem rolagem; fotografa com
   o html2canvas em 2× (nítido em slides) e baixa o PNG. Usa o tema
   atual (claro ou escuro).

   O html2canvas (~200 KB) só é baixado no primeiro uso, do unpkg
   (já liberado na CSP para o Leaflet), com SRI.
   ============================================================ */

import { el } from "./dom.js";

const LIBRARY = {
    src: "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
    integrity: "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H"
};

let loading = null;

const loadLibrary = () => {
    if (window.html2canvas) {
        return Promise.resolve(window.html2canvas);
    }

    if (!loading) {
        loading = new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src = LIBRARY.src;
            script.integrity = LIBRARY.integrity;
            script.crossOrigin = "anonymous";
            script.onload = () => resolve(window.html2canvas);
            script.onerror = () => {
                loading = null;
                script.remove();
                reject(new Error("não foi possível carregar o gerador de imagem (sem internet?)"));
            };
            document.head.appendChild(script);
        });
    }

    return loading;
};

/*
   Cópia do card para a imagem: sem ids (não duplicar os da
   página), sem o cabeçalho (o título vai na folha, maior), sem
   botões e com tudo visível.
*/
const cloneCard = (card) => {
    const clone = card.cloneNode(true);

    clone.removeAttribute("id");
    clone.removeAttribute("hidden");
    clone.classList.add("export-card");
    clone.querySelectorAll(".card-header, .group-pager").forEach((node) => node.remove());
    clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));

    return clone;
};

const toBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("falha ao gerar a imagem"))), "image/png");
});

const download = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: fileName });

    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function exportCardPng({ card, title, subtitle, meta, fileName }) {
    const html2canvas = await loadLibrary();
    const sheet = el("div", { class: "export-sheet", "aria-hidden": "true" }, [
        el("header", {}, [
            el("h1", { class: "export-sheet-title", text: title }),
            subtitle ? el("p", { class: "export-sheet-subtitle", text: subtitle }) : null,
            meta ? el("p", { class: "export-sheet-meta", text: meta }) : null
        ]),
        cloneCard(card),
        el("footer", { class: "export-sheet-footer" }, [
            el("span", { text: "WebGIS · Analytics" }),
            el("span", { text: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) })
        ])
    ]);

    /*
       Mesma largura do card na tela (+ margens da folha), para a
       imagem sair com as mesmas proporções; limitada para não ficar
       estreita demais num celular nem enorme num monitor ultrawide.
    */
    const width = Math.min(1920, Math.max(760, Math.round(card.getBoundingClientRect().width) + 72));

    sheet.style.width = `${width}px`;
    document.body.appendChild(sheet);

    try {
        const canvas = await html2canvas(sheet, {
            scale: 2,
            logging: false,
            backgroundColor: getComputedStyle(sheet).backgroundColor,
            /* A folha fica invisível na página; só a cópia fotografada aparece. */
            onclone: (doc, clone) => {
                clone.style.visibility = "visible";
            }
        });

        download(await toBlob(canvas), fileName);
    } finally {
        sheet.remove();
    }
}
