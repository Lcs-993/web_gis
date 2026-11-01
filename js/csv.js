/* ============================================================
   LEITOR DE CSV

   Compartilhado pelos módulos de clima e de queimadas.

   Não usamos biblioteca: os arquivos são tabulados simples e
   cabem em poucas linhas. O que o leitor precisa acertar está
   listado em limparTexto e numero.
   ============================================================ */

(function () {
    "use strict";

    const CR = 13;
    const BOM = 0xfeff;


    /*
       Some com BOM e espaços das pontas.

       O previsao_bambui.csv vem em utf-8-sig, ou seja, com BOM no
       começo — sem remover, a primeira coluna sairia chamando de
       "data_previsao" viraria "﻿data_previsao" e nenhuma
       leitura por nome bateria.
    */
    const limparTexto = (texto) => {
        let saida = String(texto);

        if (saida.charCodeAt(0) === BOM) {
            saida = saida.slice(1);
        }

        return saida.trim();
    };


    /*
       Converte para número devolvendo null em vez de NaN.

       Os CSVs do INPE trazem espaço antes do sinal (" -14.626600")
       e o do IPMet traz células vazias onde não há previsão de
       chuva. Quem chama precisa distinguir "zero" de "não
       informado", então null é o valor de absence.
    */
    const numero = (texto) => {
        const limpo = limparTexto(texto);

        if (limpo === "") {
            return null;
        }

        const valor = parseFloat(limpo.replace(",", "."));

        return isFinite(valor) ? valor : null;
    };


    /*
       Separa uma linha respeitando aspas, para o caso de um
       valor Futuregear conter vírgula. Não trata quebra de linha
       dentro do campo: nenhum dos arquivos do projeto tem.
    */
    const separarLinha = (linha) => {
        const campos = [];
        let atual = "";
        let dentroAspas = false;

        for (let i = 0; i < linha.length; i++) {
            const caractere = linha.charAt(i);

            if (dentroAspas) {
                if (caractere === '"') {
                    /* Aspas duplas dentro do campo são escape. */
                    if (linha.charAt(i + 1) === '"') {
                        atual += '"';
                        i++;
                    } else {
                        dentroAspas = false;
                    }
                } else {
                    atual += caractere;
                }

                continue;
            }

            if (caractere === '"') {
                dentroAspas = true;
            } else if (caractere === ",") {
                campos.push(atual);
                atual = "";
            } else {
                atual += caractere;
            }
        }

        campos.push(atual);

        return campos.map(limparTexto);
    };


    /*
       Devolve um array de objetos, com as chaves vindas da
       própria linha de cabeçalho.
    */
    const lerCsv = (texto) => {
        const linhas = String(texto).split("\n");

        const uteis = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            let saida = "";

            /* Windows: o CR vem antes do LF e viraria lixo no
               último campo. */
            for (let j = 0; j < linha.length; j++) {
                if (linha.charCodeAt(j) !== CR) {
                    saida += linha.charAt(j);
                }
            }

            if (saida.trim() !== "") {
                uteis.push(saida);
            }
        }

        if (!uteis.length) {
            return [];
        }

        const cabecalho = separarLinha(uteis[0]);
        const registros = [];

        for (let i = 1; i < uteis.length; i++) {
            const valores = separarLinha(uteis[i]);
            const registro = {};

            for (let j = 0; j < cabecalho.length; j++) {
                registro[cabecalho[j]] = j < valores.length ? valores[j] : "";
            }

            registros.push(registro);
        }

        return registros;
    };


    window.WebGisCsv = {
        ler: lerCsv,
        numero: numero,
        limpar: limparTexto
    };

})();
