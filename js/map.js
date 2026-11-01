/* ============================================================
   WEBGIS
   Mapa base (Leaflet + Esri World Imagery)

   Se o Leaflet não carregar (sem rede, CDN bloqueado), a
   aplicação continua funcionando: o placeholder cinza
   original permanece visível e o rodapé relata o estado.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    const mapElement = document.getElementById("map");

    if (!mapElement) {
        return;
    }


    /* ============================================================
       RODAPÉ
       ============================================================ */

    const statusText = document.getElementById("footer-status");
    const coordsText = document.getElementById("footer-coords");
    const mapStatus = document.getElementById("map-status");


    /*
       O ponto de status saiu do rodapé, então o parâmetro isOnline
       não tem mais a quem se aplicar. Ele foi removido em vez de
       deixado sem uso: os sete lugares que chamam esta função
       já dizem o suficiente com o texto, e um booleano órfão
       seria herança a limpo.
    */
    const setFooterStatus = (text) => {
        if (statusText) {
            statusText.textContent = text;
        }
    };


    const setMapStatus = (text) => {
        if (!mapStatus) {
            return;
        }

        if (!text) {
            mapStatus.hidden = true;
            return;
        }

        mapStatus.textContent = text;
        mapStatus.hidden = false;
    };


    /* ============================================================
       SEM LEAFLET
       ============================================================ */

    if (typeof window.L === "undefined") {
        setFooterStatus("Mapa indisponível");
        setMapStatus("Não foi possível carregar o mapa base");

        if (coordsText) {
            coordsText.textContent = "—";
        }

        return;
    }


    /* ============================================================
       MAPA
       ============================================================ */

    const formatCoordinate = (value) =>
        value.toFixed(4).replace(".", ",");

    /*
       Só as coordenadas. O zoom e o status do rodapé saíram
       junto com o elemento que os mostrava, e updateReadout não
       pode mais consultar map.getZoom() — ele roda antes de o
       mapa existir.
     */
    const updateReadout = () => {
        const center = map.getCenter();

        if (coordsText) {
            coordsText.textContent =
                `${formatCoordinate(center.lat)}, ` +
                `${formatCoordinate(center.lng)}`;
        }
    };


    const map = window.L.map(mapElement, {
        center: [-14.235, -51.925],
        zoom: 4,
        minZoom: 4,
        maxZoom: 18,

        /* Sem os botões + e -: o zoom continua pelo scroll,
           pelo duplo clique e pelo teclado, mas sem controles
           visíveis na tela. */
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: true
    });


    /*
       Sem barra de escala.

       Ela ficava no rodapé, injetada por um canto extra em
       map._controlCorners (bottomcenter, apontando para um
       elemento de fora do mapa). Com o rodapé reduzido às
       coordenadas, esse canto saíram junto — e com ele o
       L.control.scale. A escala não é exibida em lugar nenhum
       agora: quem precisar dela deve declarar o controle
       explicitamente, sem a injeção em _controlCorners, que é
       atalho para um elemento que não existe mais.
    */


    /*
       Único mapa base do projeto: Esri World Imagery (satélite).

       O serviço usa Web Mercator (EPSG:3857) e a URL NÃO aceita
       subdomínios — por isso não há o marcador {s} no template.

       maxNativeZoom acompanha o maxZoom do mapa (4 a 18) para o
       Leaflet pedir tiles do tamanho certo. Deixá-lo em 19 faria
       o Leaflet estimar o tamanho do tile a partir do zoom 19 e
       reduzir a resolução da imagem exibida.
    */
    window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            minZoom: 4,
            maxZoom: 18,
            attribution:
                'Imagery &copy; ' +
                '<a href="https://www.esri.com/">Esri</a> &mdash; ' +
                "Source: Esri, Maxar, Earthstar Geographics, " +
                "and the GIS User Community"
        }
    ).addTo(map);


    /*
       `move zoom` (e não `moveend zoomend`) para que as
       coordenadas acompanhem o arraste em tempo real.
    */
    map.on("move zoom", updateReadout);


    const syncSize = () => {
        map.invalidateSize();
        updateReadout();
    };


    /*
       O tamanho do contêiner só é confiável depois do layout.
       `whenReady` cobre o caso normal; o `requestAnimationFrame`
       é apenas um reforço — as chamadas são idempotentes e a
       atualização do rodapé NÃO depende dele, já que
       requestAnimationFrame não roda em abas em segundo plano.
    */
    map.whenReady(syncSize);
    window.requestAnimationFrame(syncSize);


    window.addEventListener("resize", syncSize);


    updateReadout();

    setFooterStatus("Pronto");
    setMapStatus(null);


    /* ============================================================
       CAMADA VETORIAL — TALHÕES

       GeoJSON servido pelo GitHub. São ~3.300 MultiPolygon e
       4,4 MB, então o desenho usa renderizador CANVAS: o modo
       SVG padrão criaria um <path> por feição no DOM, deixando
       a página pesada e o arraste lento.
       ============================================================ */

    const TALHOES_URL =
        "https://raw.githubusercontent.com/Lcs-993/" +
        "meus_layers/main/pol_talhoes.geojson";

    const TALHOES_ATRIBUICAO =
        'Talhões: <a href="https://github.com/Lcs-993/meus_layers">' +
        "meus_layers</a>";

    /* A simbologia usa amarelo agrícola para manter a leitura sobre
       o satélite sem esconder a imagem e sem preencher o mapa. */
    const TALHOES_ESTILO = {
        color: "#f4c95d",
        weight: 1.4,
        opacity: 0.95,
        fillColor: "#f4c95d",
        fillOpacity: 0.10,
        lineCap: "round",
        lineJoin: "round"
    };

    /*
       Três níveis de realce, na mesma família de cor, para que
       "achado na busca" e "selecionado" não se confundam:
       padrão -> busca -> seleção (branco).
    */
    const TALHOES_ESTILO_BUSCA = {
        color: "#2f80ed",
        weight: 2.4,
        opacity: 1,
        fillColor: "#2f80ed",
        fillOpacity: 0.28,
        lineCap: "round",
        lineJoin: "round"
    };

    const TALHOES_ESTILO_BUSCA_ATIVO = {
        color: "#0b4f9c",
        weight: 3.2,
        opacity: 1,
        fillColor: "#5aa9ff",
        fillOpacity: 0.48,
        lineCap: "round",
        lineJoin: "round"
    };

    const TALHOES_ESTILO_ATIVO = {
        color: "#ffffff",
        weight: 3.2,
        opacity: 1,
        fillColor: "#f4c95d",
        fillOpacity: 0.42,
        lineCap: "round",
        lineJoin: "round"
    };

    /*
       Rótulos em português para as propriedades do arquivo.

       `decimais` só existe na área: os demais campos numéricos
       são códigos, e "1.056" leria como mil e cinquenta e seis
       em vez de código 1056.
    */
    const TALHOES_CAMPOS = [
        { chave: "talhao", rotulo: "Talhão" },
        { chave: "desc. fazenda", rotulo: "Fazenda" },
        { chave: "fazenda", rotulo: "Cód. da fazenda" },
        { chave: "proprietario", rotulo: "Proprietário" },
        { chave: "variedade", rotulo: "Variedade" },

        /*
           searchable: false porque área é número. Sem isso, um
           "8" digitado na busca casaria com quase todo o mundo.
        */
        { chave: "area", rotulo: "Área", decimais: 2, unidade: " ha", searchable: false }
    ];

    const talhoesInput = document.getElementById("layer-talhoes");
    const talhoesContagem = document.getElementById("layer-talhoes-count");
    const talhoesMenuItem = document.getElementById("menu-item-talhoes");
    const talhoesMenuHint = document.getElementById("menu-talhoes-hint");

    let talhoesCamada = null;
    let talhaoAtivo = null;
    let talhoesVisivel = true;
    let selecaoPorBusca = false;

    /*
       O clique num talhão não para no talhão: o Leaflet encadeia o
       evento do polígono até o L.GeoJSON e daí até o map. Então o
       handler do mapa também roda num clique sobre uma feição, e
       sem esta marca ele limparia a seleção instantsaneamente
       depois de ela ter sido aberta.

       A marca vale só para o evento em curso. A propagação é
       síncrona, então o handler do mapa roda antes do timeout; o
       timeout existe para o caso de o clique ser interceptado antes
       de chegar ao mapa, caso em que a marca sobreviveria e
       engoliria o próximo clique no vazio.
    */
    let cliqueEmFeicao = false;

    const marcarCliqueEmFeicao = () => {
        cliqueEmFeicao = true;

        window.setTimeout(() => {
            cliqueEmFeicao = false;
        }, 0);
    };

    /* Índice de busca: um texto normalizado por talhão. */
    let indiceBusca = [];

    /* Camadas que casaram com o termo digitado. */
    let talhoesAchados = new Set();

    /*
       Gancho preenchido pela seção de busca. Existe porque
       aplicarVisibilidade é declarado antes dela, e reatribuir
       um const lançaria TypeError.
    */
    let aoDesligarCamada = null;


    const formatarContagem = (valor) =>
        valor.toLocaleString("pt-BR");


    /* Espelha o estado da camada nos dois pontos de interface. */
    const sincronizarControles = () => {
        if (talhoesInput) {
            talhoesInput.checked = talhoesVisivel;
        }

        if (talhoesMenuItem) {
            talhoesMenuItem.setAttribute(
                "aria-pressed",
                String(talhoesVisivel)
            );
        }
    };


    const definirContagem = (texto) => {
        if (talhoesContagem) {
            talhoesContagem.textContent = texto;
        }

        if (talhoesMenuHint) {
            talhoesMenuHint.textContent = texto;
        }
    };


    /*
       Aplica o estilo de cada talhão conforme o estado atual.

       Passar por um único repaint evita o bug de "estilos
       acumulados": quando a busca é limpa, o realce anterior
       voltaria a ser o do clique, e vice-versa.
    */
    const repintar = () => {
        if (!talhoesCamada) {
            return;
        }

        talhoesCamada.eachLayer((camada) => {
            if (camada === talhaoAtivo) {
                camada.setStyle(
                    selecaoPorBusca
                        ? TALHOES_ESTILO_BUSCA_ATIVO
                        : TALHOES_ESTILO_ATIVO
                );
            } else if (talhoesAchados.has(camada)) {
                camada.setStyle(TALHOES_ESTILO_BUSCA);
            } else {
                camada.setStyle(TALHOES_ESTILO);
            }
        });
    };


    const limparSelecao = () => {
        talhaoAtivo = null;
        repintar();
    };


    /*
         Clicar numa área sem feição deseleciona o talhão.

         Só age havendo talhão ativo: sem seleção, repintar as 3.292
         feições seria trabalho à toa a cada clique no mapa.

       A busca não é desfeita aqui. O termo continua no campo e os
       realces continuam no mapa, porque uma consulta é outra
       coisa — para limpá-la existe o botão do campo de busca.
    */
    map.on("click", () => {
        if (cliqueEmFeicao) {
            return;
        }

        if (!talhaoAtivo) {
            return;
        }

        map.closePopup();
        selecaoPorBusca = false;
        limparSelecao();
    });


    const mostrarPopup = (feicao, camada) => {
        const propriedades = feicao.properties || {};

        const valorDe = (campo) => {
            const bruto = propriedades[campo.chave];

            if (bruto === null || bruto === undefined || bruto === "") {
                return null;
            }

            const unidade = campo.unidade || "";

            if (typeof bruto !== "number") {
                return `${bruto}${unidade}`;
            }

            if (campo.decimais === undefined) {
                /* Identificador: sem decimais nem separador. */
                return `${Math.round(bruto)}${unidade}`;
            }

            return `${bruto.toLocaleString("pt-BR", {
                minimumFractionDigits: campo.decimais,
                maximumFractionDigits: campo.decimais
            })}${unidade}`;
        };

        const pares = TALHOES_CAMPOS
            .map((campo) => ({ campo, valor: valorDe(campo) }))
            .filter((par) => par.valor !== null);

        if (!pares.length) {
            map.closePopup();
            return;
        }

        /*
           textContent em vez de innerHTML: o proprietário vem
           do arquivo e não deve ser interpretado como marcação.
        */
        const conteudo = document.createElement("dl");
        conteudo.className = "feature-info";

        pares.forEach((par) => {
            const termo = document.createElement("dt");
            termo.textContent = par.campo.rotulo;

            const descricao = document.createElement("dd");
            descricao.textContent = par.valor;

            conteudo.appendChild(termo);
            conteudo.appendChild(descricao);
        });

        limparSelecao();
        talhaoAtivo = camada;
        repintar();
        camada.bringToFront();
        camada.bindPopup(conteudo, {
            className: "talhao-popup",
            maxWidth: 280
        }).openPopup();
    };


    const aplicarVisibilidade = () => {
        if (!talhoesCamada) {
            return;
        }

        if (talhoesVisivel) {
            if (!map.hasLayer(talhoesCamada)) {
                talhoesCamada.addTo(map);
                map.attributionControl.addAttribution(
                    TALHOES_ATRIBUICAO
                );
            }
        } else {
            if (map.hasLayer(talhoesCamada)) {
                map.removeLayer(talhoesCamada);
                map.attributionControl.removeAttribution(
                    TALHOES_ATRIBUICAO
                );
            }

            map.closePopup();
            limparSelecao();

            if (aoDesligarCamada) {
                aoDesligarCamada();
            }
        }

        sincronizarControles();
    };


    const alternarVisibilidade = () => {
        talhoesVisivel = !talhoesVisivel;
        aplicarVisibilidade();
    };


    if (talhoesInput) {
        talhoesInput.addEventListener("change", () => {
            talhoesVisivel = talhoesInput.checked;
            aplicarVisibilidade();
        });
    }

    if (talhoesMenuItem) {
        talhoesMenuItem.addEventListener("click", (event) => {
            /*
               O navigation.js fecha qualquer dropdown ao clicar
               em .dropdown-item. Impedir a propagação mantém o
               menu aberto, para dar para ligar e desligar sem
               ter que reabrir a cada vez.
            */
            event.preventDefault();
            event.stopPropagation();

            alternarVisibilidade();
        });
    }


    const carregarTalhoes = async () => {
        setFooterStatus("Carregando talhões…");

        if (talhoesInput) {
            talhoesInput.disabled = true;
        }

        let dados;

        try {
            const resposta = await fetch(TALHOES_URL);

            if (!resposta.ok) {
                throw new Error(`HTTP ${resposta.status}`);
            }

            dados = await resposta.json();
        } catch (erro) {
            /*
               Falha no dado não é falha no mapa: o satélite segue
               normal e o rodapé apenas informa o que houve.
            */
            definirContagem("—");

            if (talhoesInput) {
                talhoesInput.disabled = true;
                talhoesInput.checked = false;
            }

            if (talhoesMenuItem) {
                talhoesMenuItem.disabled = true;
            }

            setFooterStatus("Talhões indisponíveis");
            return;
        }

        if (
            !dados ||
            dados.type !== "FeatureCollection" ||
            !Array.isArray(dados.features)
        ) {
            definirContagem("—");
            setFooterStatus("Talhões inválidos");
            return;
        }

        talhoesCamada = window.L.geoJSON(dados, {
            renderer: window.L.canvas(),
            style: TALHOES_ESTILO
        });

        /*
           Um único handler no grupo em vez de um por feição:
           o Leaflet encadeia os eventos dos filhos até o
           L.GeoJSON, então o polígono clicado vem em
           propagatedFrom. Ligar 3.292 listeners isolados
           custaria mais caro do que o ganho.
        */
        talhoesCamada.on("click", (evento) => {
            const origem = evento.propagatedFrom || evento.sourceTarget;

            if (origem && origem.feature) {
                marcarCliqueEmFeicao();
                mostrarPopup(origem.feature, origem);
            }
        });

        definirContagem(formatarContagem(dados.features.length));

        construirIndiceBusca();

        if (talhoesInput) {
            talhoesInput.disabled = false;
        }

        aplicarVisibilidade();

        if (talhoesVisivel && talhoesCamada.getBounds().isValid()) {
            /*
               fitBounds calcula o zoom a partir do tamanho ATUAL
               do contêiner. Como o dado chega depois da primeira
               pintura, esse tamanho pode ainda estar mudando
               (fontes, barra superior) — e o enquadramento sairia
               apertado, cortando parte da camada. invalidar o
               tamanho força o Leaflet a remedir antes de calcular.
            */
            map.invalidateSize({ animate: false });

            map.fitBounds(talhoesCamada.getBounds(), {
                padding: [24, 24],
                maxZoom: 16
            });
        }

        setFooterStatus("Pronto");
    };


    /* ============================================================
       BUSCA

       Varre o GeoJSON que já está em memória. Não usa nenhum
       serviço externo: os 3.292 talhões chegam com a camada, e
       o texto de busca é pré-calculado uma vez por talhão, então
       cada tecla digitada é só um indexOf sobre 3.292 strings.
       ============================================================ */

    const buscaCampo = document.getElementById("campo-busca");
    const buscaLimpar = document.getElementById("busca-limpar");
    const buscaFeedback = document.getElementById("busca-feedback");
    const consultaContagem = document.getElementById(
        "menu-consulta-contagem"
    );

    let buscaPendente = null;


    /*
       Faixa de marcas combinantes (U+0300 a U+036F) que o NFD
       separa das letras. Montada com fromCharCode de propósito:
       escrever \u0300 direto no arquivo é fácil de corromper numa
       edição, e uma classe com os caracteres literais é ilegível.
    */
    const MARCAS_COMBINANTES = new RegExp(
        "[" +
            String.fromCharCode(0x0300) +
            "-" +
            String.fromCharCode(0x036f) +
        "]",
        "g"
    );


    /*
       Pontuação que atrapalha a comparação.

       Os escapes ficam longe do MARCAS_COMBINANTES de propósito:
       aquele é montado com fromCharCode porque um \uXXXX dentro
       de uma classe de regex é fácil de corromper sem perceber
       (vira o caractere literal e continua "funcionando").
    */
    const PONTUACAO_BUSCA = new Set([
        "'",
        "\u2018", "\u2019", "\u02bc",   // aspas simples
        "\"",
        "\u201c", "\u201d",            // aspas duplas
        "-", ",", ".", "/", "(", ")", "_"
    ]);


    const limparPontuacao = (texto) => {
        let saida = "";

        for (let i = 0; i < texto.length; i++) {
            const caractere = texto.charAt(i);

            if (!PONTUACAO_BUSCA.has(caractere)) {
                saida += caractere;
            }
        }

        return saida;
    };


    /*
       Tira acento, caixa e pontuação.

       A pontuação é removida porque os dados grafam a mesma
       fazenda de seis jeitos ("OLHOS D AGUA", "OLHOS D"AGUA",
       "OLHOS DAGUA-CN"), e ninguém digita "olhos d agua" com
       aspas retas se o nome não as tem.
    */
    const normalizar = (texto) => limparPontuacao(
        String(texto)
            .normalize("NFD")
            .replace(MARCAS_COMBINANTES, "")
            .toLowerCase()
            .trim()
    );


    const normalizarCodigo = (valor) => {
        const texto = String(valor === null || valor === undefined ? "" : valor)
            .trim();

        if (/^\d+(?:\.0+)?$/.test(texto)) {
            return texto.replace(/\.0+$/, "");
        }

        return normalizar(texto);
    };


    const interpretarBuscaPorCodigo = (termo) => {
        const partes = String(termo)
            .split(",")
            .map((parte) => parte.trim());

        if (
            partes.length === 2 &&
            /^\d+$/.test(partes[0]) &&
            /^\d+$/.test(partes[1])
        ) {
            return {
                fazenda: normalizarCodigo(partes[0]),
                talhao: normalizarCodigo(partes[1])
            };
        }

        if (partes.length === 1 && /^\d+$/.test(partes[0])) {
            return {
                fazenda: normalizarCodigo(partes[0]),
                talhao: null
            };
        }

        return null;
    };


    const construirIndiceBusca = () => {
        indiceBusca = [];

        talhoesCamada.eachLayer((camada) => {
            const propriedades =
                (camada.feature && camada.feature.properties) || {};

            const texto = TALHOES_CAMPOS
                .filter((campo) => campo.searchable !== false)
                .map((campo) => propriedades[campo.chave])
                .filter((valor) => (
                    valor !== null &&
                    valor !== undefined &&
                    valor !== ""
                ))
                .map(normalizar)
                .join(" ");

            indiceBusca.push({
                camada: camada,
                texto: texto,
                fazenda: normalizarCodigo(propriedades.fazenda),
                talhao: normalizarCodigo(propriedades.talhao),

                /*
                   Segunda forma, sem espaços. Só entra em ação
                   quando a busca por termos inteiros não acha
                   nada: é o que junta "D AGUA" com "DAGUA".
                */
                compacto: texto.split("").join("")
            });
        });
    };


    /*
       Duas passadas, da mais estrita para a mais tolerante.

       1ª: cada termo tem que aparecer inteiro, em qualquer campo.
           "simão sp80" acha o talhão cuja fazenda é São Simão e
           cuja variedade é SP80, sem exigir sequência.

       2ª: só quando a 1ª volta vazia. Compara o termo inteiro
           contra o texto sem espaços, o que ressuscita nomes
           grafados "D AGUA" / "DÁGUA" / "DAGUA".
    */
    const encontrar = (termo) => {
        const consultaPorCodigo = interpretarBuscaPorCodigo(termo);

        if (consultaPorCodigo) {
            return indiceBusca
                .filter((item) => (
                    item.fazenda === consultaPorCodigo.fazenda &&
                    (
                        consultaPorCodigo.talhao === null ||
                        item.talhao === consultaPorCodigo.talhao
                    )
                ))
                .map((item) => item.camada);
        }

        const limpo = normalizar(termo);

        if (!limpo) {
            return [];
        }

        const termos = limpo.split(" ").filter(Boolean);
        const diretos = [];

        for (let i = 0; i < indiceBusca.length; i++) {
            const item = indiceBusca[i];

            let casa = true;

            for (let j = 0; j < termos.length; j++) {
                if (item.texto.indexOf(termos[j]) === -1) {
                    casa = false;
                    break;
                }
            }

            if (casa) {
                diretos.push(item.camada);
            }
        }

        if (diretos.length) {
            return diretos;
        }

        const compacto = limpo.split("").join("");

        if (!compacto) {
            return [];
        }

        const frouxos = [];

        for (let i = 0; i < indiceBusca.length; i++) {
            const item = indiceBusca[i];

            if (item.compacto.indexOf(compacto) !== -1) {
                frouxos.push(item.camada);
            }
        }

        return frouxos;
    };


    const mostrarFeedback = (texto) => {
        if (!buscaFeedback) {
            return;
        }

        if (!texto) {
            buscaFeedback.hidden = true;
            buscaFeedback.textContent = "";
            return;
        }

        buscaFeedback.textContent = texto;
        buscaFeedback.hidden = false;
    };


    const atualizarContagemConsulta = (total) => {
        if (consultaContagem) {
            consultaContagem.textContent = formatarContagem(total);
        }
    };


    const enquadrarResultado = (camadas) => {
        if (!camadas.length) {
            return;
        }

        const limites = new window.L.LatLngBounds();

        for (let i = 0; i < camadas.length; i++) {
            limites.extend(camadas[i].getBounds());
        }

        map.fitBounds(limites, {
            padding: [40, 40],
            maxZoom: 17
        });
    };


    const limparBusca = () => {
        if (buscaPendente) {
            window.clearTimeout(buscaPendente);
            buscaPendente = null;
        }

        talhoesAchados = new Set();
        selecaoPorBusca = false;
        repintar();

        mostrarFeedback(null);
        atualizarContagemConsulta(0);

        if (buscaLimpar) {
            buscaLimpar.hidden = true;
        }
    };


    const rodarBusca = () => {
        buscaPendente = null;

        if (!buscaCampo) {
            return;
        }

        const termo = buscaCampo.value;

        map.closePopup();
        talhaoAtivo = null;

        if (buscaLimpar) {
            buscaLimpar.hidden = termo === "";
        }

        if (!indiceBusca.length) {
            mostrarFeedback("Camada de talhões ainda não carregou");
            return;
        }

        if (!talhoesVisivel) {
            mostrarFeedback("Ative a camada Talhões para buscar");
            return;
        }

        if (!normalizar(termo)) {
            talhoesAchados = new Set();
            selecaoPorBusca = false;
            repintar();
            mostrarFeedback(null);
            atualizarContagemConsulta(0);
            return;
        }

        const achados = encontrar(termo);

        talhoesAchados = new Set(achados);
        selecaoPorBusca = achados.length > 0;
        repintar();

        atualizarContagemConsulta(achados.length);

        if (!achados.length) {
            mostrarFeedback("Nenhum talhão encontrado");
            return;
        }

        /* O mapa, o popup e a contagem do menu já confirmam o resultado. */
        mostrarFeedback(null);

        enquadrarResultado(achados);
    };


    const agendarBusca = () => {
        if (buscaPendente) {
            window.clearTimeout(buscaPendente);
        }

        /*
           Espera a digitação parar. Mesmo com o índice pronto o
           repaint toca 3.292 camadas, e refazê-lo a cada tecla
           desperdiça trabalho.
        */
        buscaPendente = window.setTimeout(rodarBusca, 160);
    };


    if (buscaCampo) {
        buscaCampo.addEventListener("input", agendarBusca);

        /* Enter dispara na hora, sem esperar o debounce. */
        buscaCampo.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter") {
                evento.preventDefault();

                if (buscaPendente) {
                    window.clearTimeout(buscaPendente);
                    buscaPendente = null;
                }

                rodarBusca();
                return;
            }

            if (evento.key === "Escape" && buscaCampo.value !== "") {
                evento.stopPropagation();

                buscaCampo.value = "";
                limparBusca();
            }
        });

        /*
           Sair do campo não deve apagar o resultado: a busca
           é um estado, não uma edição. Quem descarta é o "x"
           ou o Esc.
        */
        buscaCampo.addEventListener("blur", () => {
            if (buscaLimpar) {
                buscaLimpar.hidden = buscaCampo.value === "";
            }
        });
    }

    if (buscaLimpar) {
        buscaLimpar.addEventListener("click", () => {
            if (buscaCampo) {
                buscaCampo.value = "";
                buscaCampo.focus();
            }

            limparBusca();
        });
    }

    /*
       Desligar a camada apaga a busca: os talhões sumiriam do
       mapa e o realce ficaria invisível e sem sentido.
    */
    aoDesligarCamada = () => {
        if (buscaCampo) {
            buscaCampo.value = "";
        }

        limparBusca();
    };


    /*
       Carrega depois do mapa estar pronto: os 4,4 MB não devem
       atrasar a primeira pintura do satélite.
    */
    window.setTimeout(carregarTalhoes, 0);

});
