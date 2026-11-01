/* ============================================================
   MÓDULO DE ANÁLISE DE QUEIMADAS

   Consulta os focos de incêndio do INPE (dataserver-coids) ao
   vivo. O serviço responde com Access-Control-Allow-Origin: *,
   então dá para buscar direto do navegador — ao contrário do
   IPMet, que barra o acesso.

   ESCOPO: só interessam os focos perto dos talhões. A propriedade
   tem lat -20.35..-19.90 / lon -46.28..-45.64, e o país inteiro
   queima o tempo todo: numa amostra de 10.406 focos, nenhum estava
   a menos de 97 km. Sem o filtro, o módulo mostraria o Brasil
   inteiro e os talhões sumiriam no meio.

   RAIO: o retângulo dos talhões mais 0,5° de folga (uns 55 km),
   o que dá uma região de cerca de 170 x 155 km. É largo o bastante
   para alcançar os focos que de fato occurrem por perto, e estreito
   o bastante para continuar falando da propriedade. O raio aparece
   na tela porque "0" só faz sentido com ele ao lado.

   DEDUPLICAÇÃO: o mesmo incêndio é redetectado a cada arquivo de
   10 minutos, com as mesmas coordenadas. Somar os arquivos sem
   deduplicar contaria o mesmo fogo várias vezes — por isso a chave
   é a coordenada arredondada, que funde leituras separadas por
   menos de ~100 m.
   ============================================================ */

(function () {
    "use strict";

    const DIRETORIO =
        "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/";

    const LISTAGEM = DIRETORIO + "?C=M;O=D";

    /* Retângulo dos talhões, do bbox da camada pol_talhoes. */
    const LAT_MIN = -20.3527;
    const LAT_MAX = -19.9028;
    const LON_MIN = -46.2765;
    const LON_MAX = -45.6398;

    /* Folga em graus em volta do retângulo, ~55 km. */
    const FOLGA = 0.5;

    /* Quantos arquivos de 10 min somar: 3 = janela de 30 min. */
    const ARQUIVOS = 3;

    const secao = document.getElementById("secao-queimadas");
    const conteudo = document.getElementById("queimadas-conteudo");
    const itemMenu = document.getElementById("menu-queimadas");

    let estado = null;
    let carregando = false;


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
       Distância aproximada em km, pelo plano local.

       Só para ordenar e rotular a lista: a diferença entre essa
       aproximação e a great-circle é de décimos de por cento
       neste trecho do Brasil, e nem dá para ver.
    */
    const distanciaKm = (lat, lon) => {
        const latCentro = (LAT_MIN + LAT_MAX) / 2;
        const lonCentro = (LON_MIN + LON_MAX) / 2;

        const dLat = (lat - latCentro) * 111;
        const dLon = (lon - lonCentro) * 102;

        return Math.sqrt(dLat * dLat + dLon * dLon);
    };


    const dentroDaRegiao = (lat, lon) =>
        lat >= LAT_MIN - FOLGA &&
        lat <= LAT_MAX + FOLGA &&
        lon >= LON_MIN - FOLGA &&
        lon <= LON_MAX + FOLGA;


    /*
       Monta o padrão do nome de arquivo sem barra invertida.

       Uma regex literal com "\." é frágil de editar, então a
       string é passada para o construtor — não há escape
       nenhum envolvido.
    */
    const padraoArquivo = new RegExp(
        "focos_10min_([0-9]{8}_[0-9]{4})"
    );


    const nomesRecentes = (html) => {
        const vistos = {};
        const nomes = [];

        const padrao = new RegExp(
            padraoArquivo.source,
            "g"
        );

        let achado = padrao.exec(html);

        while (achado && nomes.length < ARQUIVOS) {
            const nome = achado[0] + ".csv";

            if (!vistos[nome]) {
                vistos[nome] = true;
                nomes.push(nome);
            }

            achado = padrao.exec(html);
        }

        return nomes;
    };


    /*
       "2026-09-26 01:30:00" em ISO, para ordenar e para exibir.
    */
    const lerInstante = (texto) => {
        const partes = String(texto).split(" ");
        const data = partes[0].split("-");
        const hora = (partes[1] || "00:00:00").split(":");

        return new Date(
            parseInt(data[0], 10),
            parseInt(data[1], 10) - 1,
            parseInt(data[2], 10),
            parseInt(hora[0], 10),
            parseInt(hora[1], 10),
            parseInt(hora[2] || "0", 10)
        );
    };


    const buscarTexto = (url) =>
        window
            .fetch(url)
            .then((resposta) => {
                if (!resposta.ok) {
                    throw new Error(url + " — HTTP " + resposta.status);
                }

                return resposta.text();
            });


    /*
       Lê a janela recente e devolve o recorte da região.

       Nacional fica no retorno só para contexto: é o que permite
       dizer "0 de 41" em vez de um "0" solto, que parece falha.
    */
    const consultar = () => {
        return buscarTexto(LISTAGEM).then((html) => {
            const nomes = nomesRecentes(html);

            if (!nomes.length) {
                throw new Error("Nenhum arquivo de focos na listagem");
            }

            /*
               Cada arquivo é buscado por conta própria, e uma
               falha não derruba a janela inteira: o INPE serve
               três arquivos e perder um ainda deixa dado válido.

               Mas as falhas são contadas. Sem isso, todos os três
               falhando produziam "0 de 0 focos distintos" — um
               zero confiante que é indistinguível de "não houve
               fogo", e é a leitura errada.
            */
            return nomes
                .reduce(
                    (sequencia, nome) =>
                        sequencia.then((acumulado) =>
                            buscarTexto(DIRETORIO + nome).then(
                                (csv) => ({
                                    leituras: acumulado.leituras.concat(
                                        lerArquivo(csv)
                                    ),
                                    falhas: acumulado.falhas
                                }),
                                () => ({
                                    leituras: acumulado.leituras,
                                    falhas: acumulado.falhas + 1
                                })
                            )
                        ),
                    Promise.resolve({ leituras: [], falhas: 0 })
                )
                .then((acumulado) => {
                    if (acumulado.falhas === nomes.length) {
                        throw new Error(
                            "nenhum dos " +
                                nomes.length +
                                " arquivos respondeu"
                        );
                    }

                    const estado = montarEstado(
                        acumulado.leituras,
                        nomes
                    );

                    estado.falhas = acumulado.falhas;

                    return estado;
                });
        });
    };


    const lerArquivo = (csv) => {
        const registros = window.WebGisCsv.ler(csv);
        const linhas = [];

        for (let i = 0; i < registros.length; i++) {
            const registro = registros[i];
            const lat = window.WebGisCsv.numero(registro.lat);
            const lon = window.WebGisCsv.numero(registro.lon);

            if (lat === null || lon === null) {
                continue;
            }

            linhas.push({
                lat: lat,
                lon: lon,
                satelite: registro.satelite || "",
                instante: registro.data || ""
            });
        }

        return linhas;
    };


    const montarEstado = (leituras, nomes) => {
        /* Dedup por coordenada: mesmo fogo visto em arquivos
           seguidos conta uma vez só. */
        const unicos = {};
        const chaves = [];

        let nacional = 0;

        for (let i = 0; i < leituras.length; i++) {
            const foco = leituras[i];
            nacional++;

            const chave =
                foco.lat.toFixed(3) + "," + foco.lon.toFixed(3);

            if (unicos[chave]) {
                if (foco.instante > unicos[chave].instante) {
                    unicos[chave].instante = foco.instante;
                }

                continue;
            }

            const local = dentroDaRegiao(foco.lat, foco.lon);

            unicos[chave] = {
                lat: foco.lat,
                lon: foco.lon,
                satelite: foco.satelite,
                instante: foco.instante,
                naRegiao: local,
                distancia: local ? distanciaKm(foco.lat, foco.lon) : null
            };

            chaves.push(chave);
        }

        const todos = chaves.map((chave) => unicos[chave]);

        todos.sort((a, b) => a.instante.localeCompare(b.instante));

        const naRegiao = todos
            .filter((f) => f.naRegiao)
            .sort((a, b) => a.distancia - b.distancia);

        return {
            arquivos: nomes.length,
            leituras: nacional,
            distintos: todos.length,
            falhas: 0,
            naRegiao: naRegiao,
            maisRecente: naRegiao.length
                ? naRegiao[naRegiao.length - 1].instante
                : null,
            satelites: unicosSAT(naRegiao)
        };
    };


    const unicosSAT = (focos) => {
        const vistos = {};
        const lista = [];

        for (let i = 0; i < focos.length; i++) {
            const nome = focos[i].satelite;

            if (nome && !vistos[nome]) {
                vistos[nome] = true;
                lista.push(nome);
            }
        }

        return lista;
    };


    const formatarInstante = (texto) => {
        const data = lerInstante(texto);

        if (isNaN(data.getTime())) {
            return texto || "—";
        }

        return (
            data.toLocaleDateString("pt-BR") +
            " " +
            data.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit"
            })
        );
    };


    const desenharFoco = (foco) => {
        const linha = elemento("li", "queimadas-foco");

        const quando = elemento("span", "queimadas-foco-quando");
        quando.textContent = formatarInstante(foco.instante);

        const onde = elemento("span", "queimadas-foco-onde");
        onde.textContent =
            foco.lat.toFixed(3) +
            ", " +
            foco.lon.toFixed(3) +
            " · " +
            Math.round(foco.distancia) +
            " km do centro" +
            (foco.satelite ? " · " + foco.satelite : "");

        linha.appendChild(quando);
        linha.appendChild(onde);

        return linha;
    };


    const desenharAviso = (texto) => {
        conteudo.appendChild(elemento("p", "modulo-aviso", texto));
    };


    const desenhar = () => {
        conteudo.textContent = "";

        if (!estado) {
            desenharFalha();
            return;
        }

        const meta = elemento("p", "modulo-meta");
        meta.appendChild(elemento("strong", null, "Focos de incêndio"));
        meta.appendChild(
            elemento("span", "modulo-meta-sufixo", " · INPE COIDS")
        );
        conteudo.appendChild(meta);

        const periodo = elemento("p", "modulo-meta-detalhe");
        periodo.textContent =
            "Janela de " +
            ARQUIVOS * 10 +
            " min (" +
            estado.arquivos +
            (estado.arquivos > 1 ? " arquivos" : " arquivo") +
            ")";
        conteudo.appendChild(periodo);

        /* O número grande. */
        const destaque = elemento("div", "queimadas-destaque");
        destaque.appendChild(
            elemento("span", "queimadas-numero", String(estado.naRegiao.length))
        );
        destaque.appendChild(
            elemento(
                "span",
                "queimadas-numero-rotulo",
                estado.naRegiao.length === 1
                    ? "foco na região"
                    : "focos na região"
            )
        );
        conteudo.appendChild(destaque);

        /*
           Contexto. Sem isto o "0" fica sem informação: o leitor
           não sabe se não houve fogo ou se a consulta falhou.
        */
        const contexto = elemento("p", "modulo-meta-detalhe");
        contexto.textContent =
            estado.naRegiao.length +
            " de " +
            estado.distintos +
            " focos distintos no país" +
            (estado.leituras !== estado.distintos
                ? " (" + estado.leituras + " leituras, dedupadas por ponto)"
                : "");

        if (estado.satelites.length) {
            contexto.textContent += " · " + estado.satelites.join(", ");
        }

        conteudo.appendChild(contexto);

        /* O raio, sempre. É o que dá sentido ao zero. */
        const escopo = elemento("p", "modulo-escopo");
        escopo.textContent =
            "Região: talhões + " +
            FOLGA.toFixed(1).replace(".", ",") +
            "° de folga (~" +
            Math.round(FOLGA * 111) +
            " km). Focos fora disso são ignorados.";
        conteudo.appendChild(escopo);

        /*
           Janela parcial. Preferimos dizer que a contagem é menor
           do que a pedida a esconder o arquivo que faltou.
        */
        if (estado.falhas) {
            desenharAviso(
                estado.falhas +
                    " de " +
                    estado.arquivos +
                    " arquivos não responderam. A contagem abaixo " +
                    "cobre só o que veio."
            );
        }

        if (!estado.naRegiao.length) {
            conteudo.appendChild(
                elemento(
                    "p",
                    "queimadas-vazio",
                    "Nenhum foco na região dos talhões nesta janela."
                )
            );
        } else {
            const lista = elemento("ul", "queimadas-lista");

            estado.naRegiao.forEach((foco) => {
                lista.appendChild(desenharFoco(foco));
            });

            conteudo.appendChild(lista);
        }

        conteudo.appendChild(botaoAtualizar());
    };


    const botaoAtualizar = () => {
        const linha = elemento("div", "modulo-acoes");

        const botao = elemento("button", "modulo-botao", "Atualizar");
        botao.type = "button";

        botao.addEventListener("click", () => {
            carregar(true);
        });

        linha.appendChild(botao);

        /* Só com a região atingida há detecção a datar. Sem este
           teste, sobrava um <span> vazio ao lado do botão. */
        if (estado && estado.maisRecente) {
            linha.appendChild(
                elemento(
                    "span",
                    "modulo-meta-detalhe",
                    "Última detecção " +
                        formatarInstante(estado.maisRecente)
                )
            );
        }

        return linha;
    };


    const desenharFalha = (detalhe) => {
        conteudo.textContent = "";
        conteudo.appendChild(
            elemento("p", "modulo-meta", "Focos de incêndio")
        );
        desenharAviso(
            "Queimadas indisponíveis: não foi possível consultar o " +
                "INPE." +
                (detalhe ? " " + detalhe : "")
        );
        conteudo.appendChild(botaoAtualizar());
    };


    const carregar = (forcar) => {
        if (carregando || !conteudo) {
            return;
        }

        if (forcar) {
            estado = null;
        }

        carregando = true;
        conteudo.textContent = "Consultando INPE…";

        consultar()
            .then((resultado) => {
                estado = resultado;
                desenhar();
            })
            .catch((erro) => {
                estado = null;
                desenharFalha(erro && erro.message);
            })
            .then(() => {
                /*
                   O botão não precisa ser desabilitado durante a
                   consulta: o painel inteiro é substituído por
                   "Consultando INPE…", então ele sai do DOM antes
                   de poder receber um segundo clique. E a guarda
                   "if (carregando) return" cobre quem aciona o item
                   de menu enquanto a consulta está em curso.
                */
                carregando = false;
            });
    };


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

        carregar(false);
    };


    if (itemMenu) {
        itemMenu.addEventListener("click", (evento) => {
            evento.preventDefault();
            mostrar();
        });
    }

})();
