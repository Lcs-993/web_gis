/* ============================================================
   MÓDULO DE PREVISÃO CLIMÁTICA

   Lê previsao_bambui.csv, gerado por imet_previsao_cidades.ipynb
   a partir do IPMet Radar (estação A565 — Bambuí/MG).

   Por que um arquivo e não a consulta direta: a página do
   IPMet não devolve Access-Control-Allow-Origin e ainda exige um
   header Referer, que o navegador não tem como enviar. Buscar ao
   vivo daria CORS bloqueado. O CSV é a única via sem um proxy no
   meio.

   Consequência: a previsão é um retrato. Ela vale para a janela
   que cobre, não para hoje — e essa janela está expirando. O
   módulo diz isso na tela em vez de fingir que é o tempo atual.
   ============================================================ */

(function () {
    "use strict";

    const CSV_URL = "previsao_bambui.csv";
    const CIDADE = "Bambuí, MG";
    const ESTACAO = "IPMet Radar A565";
    const INTERVALO_HORAS = 3;

    /* Quantos períodos à frente mostrar na lista. */
    const PROXIMOS = 6;

    const secao = document.getElementById("secao-previsao");
    const conteudo = document.getElementById("previsao-conteudo");
    const itemMenu = document.getElementById("menu-previsao");

    let periodos = null;
    let coletado = null;
    let carregando = false;


    const numeroBR = (valor, casas) => {
        if (valor === null || valor === undefined) {
            return "—";
        }

        const casasEfetivas = casas || 0;

        return valor.toLocaleString("pt-BR", {
            minimumFractionDigits: casasEfetivas,
            maximumFractionDigits: casasEfetivas
        });
    };


    /*
       Sufixo só quando há número.

       Sem isto, uma célula sem previsão sai como "Chuva —%", e o
       "—" vira parte da unidade em vez de marcar a ausência.
    */
    const comSufixo = (valor, sufixo) =>
        valor === null || valor === undefined
            ? "—"
            : numeroBR(valor) + sufixo;


    const elemento = (tag, classe, texto) => {
        const el = document.createElement(tag);

        if (classe) {
            el.className = classe;
        }

        if (texto !== undefined) {
            el.textContent = texto;
        }

        return el;
    };


    /*
       "19/09" + ano da coleta + "00h" vira uma data de verdade.

       O CSV não traz o ano no campo de data, só dia e mês. O ano
       vem do coletado_em, que é a única data completa do
       arquivo.
    */
    const construirData = (diaMes, hora, ano) => {
        const partes = String(diaMes).split("/");
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const horas = parseInt(String(hora).replace("h", ""), 10);

        if (isNaN(dia) || isNaN(mes) || isNaN(horas)) {
            return null;
        }

        return new Date(ano, mes, dia, horas, 0, 0);
    };


    /*
       "2026-09-20 08:26:35" vira uma data de verdade.

       Montamos com o construtor em vez de passar o texto para
       new Date, que interpreta dd/mm e mm/dd de formas
       diferentes dependendo do navegador.
    */
    const lerColeta = (texto) => {
        const partes = String(texto).split(" ");

        if (partes.length < 2) {
            return null;
        }

        const data = partes[0].split("-");
        const hora = partes[1].split(":");

        return new Date(
            parseInt(data[0], 10),
            parseInt(data[1], 10) - 1,
            parseInt(data[2], 10),
            parseInt(hora[0], 10),
            parseInt(hora[1], 10),
            parseInt(hora[2] || "0", 10)
        );
    };


    const desenharAviso = (texto) => {
        conteudo.appendChild(elemento("p", "modulo-aviso", texto));
    };


    /*
       Uma linha por período.

       Vai como texto puro porque os valores vêm do arquivo e não
       devem virar marcação.
    */
    const desenharPeriodo = (periodo) => {
        const linha = elemento("div", "previsao-periodo");

        const quando = elemento("div", "previsao-quando");
        quando.appendChild(
            elemento("span", "previsao-hora", periodo.hora)
        );
        quando.appendChild(
            elemento("span", "previsao-dia", periodo.diaSemana)
        );

        const temp = elemento(
            "div",
            "previsao-temp",
            numeroBR(periodo.temperatura) + "°"
        );

        const medidas = elemento("div", "previsao-medidas");

        medidas.appendChild(
            elemento(
                "span",
                "previsao-medida",
                "Chuva " + comSufixo(periodo.chanceChuva, "%")
            )
        );

        medidas.appendChild(
            elemento(
                "span",
                "previsao-medida",
                (periodo.ventoDirecao || "?") +
                    " " +
                    comSufixo(periodo.ventoVelocidade, " km/h")
            )
        );

        medidas.appendChild(
            elemento(
                "span",
                "previsao-medida",
                "Umid. " + comSufixo(periodo.umidade, "%")
            )
        );

        linha.appendChild(quando);
        linha.appendChild(temp);
        linha.appendChild(medidas);

        return linha;
    };


    /*
       Totais da janela inteira. São o que dá leitura rápida: a
       lista mostra as próximas horas, o resumo dá a semana.
    */
    const desenharResumo = () => {
        const comData = periodos.filter((p) => p.data);

        if (!comData.length) {
            return;
        }

        /*
           Dias distintos, não a extensão da janela.

           A primeira e a última linha delimitam um intervalo que
           quase nunca fecha em horas exatas — a janela vai de 00h
           a 21h, o que arredondava para 8 dias num período de 7.
        */
        const dias = {};

        periodos.forEach((p) => {
            if (p.data) {
                dias[
                    p.data.getFullYear() +
                        "-" +
                        p.data.getMonth() +
                        "-" +
                        p.data.getDate()
                ] = true;
            }
        });

        const totalDias = Object.keys(dias).length;

        const temperaturas = periodos
            .map((p) => p.temperatura)
            .filter((v) => v !== null);

        if (!temperaturas.length) {
            return;
        }

        const chuvaTotal = periodos.reduce(
            (soma, p) => soma + (p.precipitacao || 0),
            0
        );

        const chanceMax = periodos.reduce(
            (maior, p) =>
                p.chanceChuva !== null && p.chanceChuva > maior
                    ? p.chanceChuva
                    : maior,
            0
        );

        const celulas = [
            [
                "Mín / máx",
                numeroBR(Math.min.apply(null, temperaturas)) +
                    "° / " +
                    numeroBR(Math.max.apply(null, temperaturas)) +
                    "°"
            ],
            ["Chuva acumulada", numeroBR(chuvaTotal, 1) + " mm"],
            ["Maior chance de chuva", numeroBR(chanceMax) + "%"],
            ["Dias", totalDias + ""]
        ];

        const resumo = elemento("div", "modulo-resumo");

        celulas.forEach((par) => {
            const celula = elemento("div", "modulo-celula");
            celula.appendChild(
                elemento("span", "modulo-celula-valor", par[1])
            );
            celula.appendChild(
                elemento("span", "modulo-celula-rotulo", par[0])
            );
            resumo.appendChild(celula);
        });

        conteudo.appendChild(resumo);
    };


    const desenhar = () => {
        conteudo.textContent = "";

        if (!periodos || !periodos.length) {
            desenharFalha();
            return;
        }

        const agora = new Date();
        const primeiro = periodos[0].data;
        const ultimo = periodos[periodos.length - 1].data;

        const MESES = [
            "jan", "fev", "mar", "abr", "mai", "jun",
            "jul", "ago", "set", "out", "nov", "dez"
        ];

        const diaCurto = (d) => d.getDate() + "/" + MESES[d.getMonth()];

        /* Identificação da fonte. */
        const meta = elemento("p", "modulo-meta");
        meta.appendChild(elemento("strong", null, CIDADE));
        meta.appendChild(
            elemento("span", "modulo-meta-sufixo", " · " + ESTACAO)
        );
        conteudo.appendChild(meta);

        const janela = elemento("p", "modulo-meta-detalhe");
        const partes = [];

        if (primeiro && ultimo) {
            partes.push(
                "Janela " + diaCurto(primeiro) + " – " + diaCurto(ultimo)
            );
        }

        if (coletado) {
            partes.push(
                "coletado em " +
                    coletado.toLocaleDateString("pt-BR") +
                    " " +
                    coletado.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit"
                    })
            );
        }

        partes.push("passo de " + INTERVALO_HORAS + "h");
        janela.textContent = partes.join(" · ");
        conteudo.appendChild(janela);

        /* A janela é o que o arquivo cobre, não o tempo de hoje.
           Se já passou, dizemos — senão o número parece atual. */
        if (ultimo && ultimo < agora) {
            desenharAviso(
                "Previsão expirada: esta janela terminava em " +
                    diaCurto(ultimo) +
                    ". Gere o CSV de novo pelo notebook para atualizar."
            );
        }

        /* Os períodos que ainda não passaram. */
        const futuros = periodos.filter((p) => p.data && p.data >= agora);

        const lista = futuros.length
            ? futuros.slice(0, PROXIMOS)
            : periodos.slice(0, PROXIMOS);

        const titulo = elemento(
            "h3",
            "modulo-subtitulo",
            futuros.length ? "Próximos períodos" : "Início da janela"
        );
        conteudo.appendChild(titulo);

        const grade = elemento("div", "previsao-grade");

        lista.forEach((periodo) => {
            grade.appendChild(desenharPeriodo(periodo));
        });

        conteudo.appendChild(grade);

        desenharResumo();
    };


    const desenharFalha = () => {
        conteudo.textContent = "";
        conteudo.appendChild(elemento("p", "modulo-meta", CIDADE));
        desenharAviso(
            "Previsão indisponível: não foi possível ler " + CSV_URL + "."
        );
    };


    const carregar = () => {
        if (carregando || !conteudo) {
            return;
        }

        carregando = true;
        conteudo.textContent = "Carregando previsão…";

        window
            .fetch(CSV_URL)
            .then((resposta) => {
                if (!resposta.ok) {
                    throw new Error("HTTP " + resposta.status);
                }

                return resposta.text();
            })
            .then((texto) => {
                const registros = window.WebGisCsv.ler(texto);

                if (!registros.length) {
                    throw new Error("CSV vazio");
                }

                const ano = parseInt(
                    String(registros[0].coletado_em).slice(0, 4),
                    10
                );

                coletado = lerColeta(registros[0].coletado_em);

                periodos = registros.map((registro) => ({
                    data: construirData(
                        registro.data_previsao,
                        registro.hora,
                        ano
                    ),
                    diaSemana: registro.dia_semana,
                    hora: registro.hora,
                    temperatura: window.WebGisCsv.numero(
                        registro.temperatura_c
                    ),
                    umidade: window.WebGisCsv.numero(registro.umidade_pct),
                    ventoDirecao: registro.direcao_vento,
                    ventoVelocidade: window.WebGisCsv.numero(
                        registro.velocidade_vento_kmh
                    ),
                    precipitacao: window.WebGisCsv.numero(
                        registro.precipitacao_mm_3h
                    ),
                    chanceChuva: window.WebGisCsv.numero(
                        registro.probabilidade_chuva_pct
                    )
                }));

                periodos.sort((a, b) => {
                    if (!a.data || !b.data) {
                        return 0;
                    }

                    return a.data - b.data;
                });

                desenhar();
            })
            .catch(() => {
                periodos = null;
                desenharFalha();
            })
            .then(() => {
                carregando = false;
            });
    };


    /*
       Revela a seção e abre o painel lateral.

       O item do dropdown já existia como placeholder; só ganhou
       um id. O clique no .sidebar-toggle é o mesmo caminho que a
       navegação usa, para não duplicar a lógica de abrir/fechar.
    */
    /*
       Os dois módulos dividem o mesmo par de itens de menu, então
       marcar o próprio sem limpar o outro deixaria os dois com
       aria-current ao mesmo tempo depois de abrir Previsão e
       depois Queimadas.
    */
    const ITENS_MODULO = ["menu-previsao", "menu-queimadas"];

    const marcarItem = () => {
        ITENS_MODULO.forEach((id) => {
            const el = document.getElementById(id);

            if (!el) {
                return;
            }

            if (el === itemMenu) {
                el.setAttribute("aria-current", "true");
            } else {
                el.removeAttribute("aria-current");
            }
        });
    };


    const mostrar = () => {
        if (!secao) {
            return;
        }

        secao.hidden = false;
        marcarItem();

        const painel = document.getElementById("sidebar");
        const botao = document.querySelector(".sidebar-toggle");

        if (painel && botao && !painel.classList.contains("is-open")) {
            botao.click();
        }

        if (!periodos) {
            carregar();
        } else {
            desenhar();
        }
    };


    if (itemMenu) {
        itemMenu.addEventListener("click", (evento) => {
            evento.preventDefault();
            mostrar();
        });
    }

})();
