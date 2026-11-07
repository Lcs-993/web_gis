# WebGIS

Visualização interativa de dados geográficos no navegador: mapa, busca,
filtros, dashboard e tabela de atributos para **qualquer** camada GeoJSON.

A aplicação é orientada aos dados. Nenhum nome de atributo está no código:
popup, busca, filtros, dashboard, tabela e exportação são construídos a partir
do schema descoberto em cada camada no momento da carga.

HTML, CSS e JavaScript (ES modules), sem build e sem npm. A única dependência
de código é o **Leaflet 1.9.4**, via CDN com verificação de integridade (SRI).

---

## Como executar

Os módulos ES exigem um servidor HTTP (não funcionam abrindo o arquivo com
`file://`):

```bash
python -m http.server 8899
```

Depois acesse `http://127.0.0.1:8899`. Não há instalação nem build.

---

## Uso

| Onde | O quê |
| --- | --- |
| **Camadas** (botão no canto superior esquerdo do mapa; em tela cheia, a aba mostra no topo o logo e "WebGIS", já que a barra superior fica de fora; fecha pelo **×** preso à borda direita da aba, no alto) | Mostra/oculta camadas (ícone de olho), tematiza por categoria (ícone de paleta), liga rótulos (ícone **T**) escolhendo o atributo exibido e escolhe a **camada ativa** |
| Ícone **i** na linha da camada (Identificar) | Abre uma janela com os dados da camada: feições, geometria, origem e cada atributo com seu tipo |
| **Busca** (barra no canto superior direito) | Procura na camada ativa, respeitando os filtros |
| **Filtros** (funil dentro da barra de busca) | Monta condições por atributo; o contador mostra quantos filtros estão ativos |
| **Dashboard** (botão de gráfico nos controles do mapa) | Resumo (indicadores e distribuição por valor) e tabela ordenável e paginada; exportação CSV e KML |
| Clique numa feição | Seleciona, destaca e abre o popup; a linha correspondente é destacada na tabela |
| Clique numa linha da tabela | Seleciona e enquadra a feição no mapa |
| Controles do mapa (canto inferior direito) | Blocos agrupados, de cima para baixo: **Dashboard**; **Enquadrar** + **Tela cheia**; **Zoom** + / −; **Mapa base** |
| Botão **casa** (controles do mapa) | Repõe o enquadramento total das camadas ligadas, com todas as feições, mesmo que filtros ou busca estejam ativos |
| `Esc` | Fecha o painel aberto mais recente; na busca, limpa o termo |

Busca, filtros e dashboard operam sobre a **camada ativa**. O mapa mostra
todas as camadas ligadas.

### Busca

- Todos os termos precisam aparecer na feição, em qualquer atributo
  pesquisável (todos, exceto medidas numéricas com decimais).
- Termos numéricos casam com números inteiros: `22` acha `22`, não `122`.
- Acento, caixa e pontuação são ignorados (`olhos d'água` = `OLHOS DAGUA`).
- Sem resultado exato, uma segunda passada compara o termo sem espaços.
- `Enter` busca na hora; a digitação tem *debounce* de 160 ms.
- No mapa, os achados ficam como estão e o resto da camada esmaece (vira uma
  sombra translúcida). Nenhum realce de cor: funciona com qualquer tema.

### Seleção

Ao selecionar uma feição (clique no mapa ou na tabela), ela fica como está e
todas as outras, de todas as camadas, **esmaecem** (inclusive os achados da
busca e as divisas das fazendas). Ao limpar a seleção, tudo volta ao normal.

### Filtros

A forma de filtrar depende do tipo descoberto:

| Tipo | Como filtrar |
| --- | --- |
| número | controle de intervalo com dois marcadores, limitado ao mínimo e máximo reais da coluna |
| texto | contém, não contém, é igual a, é diferente de, está vazio, está preenchido |
| data | em, antes de, depois de, entre, está vazio, está preenchido |
| sim/não | é verdadeiro, é falso, está vazio |

**Números:** arraste os marcadores ou digite em **De** e **Até**. Com os dois
marcadores no mesmo ponto, o filtro vira "igual a" esse valor. O passo
acompanha a precisão do dado (inteiros de 1 em 1; `188,1` de 0,1 em 0,1).
Abaixo da barra, uma frase descreve o filtro e quantas feições ele mantém,
considerando os outros filtros ativos. Os filtros ativos aparecem por extenso,
sem símbolos (ex.: "Valor por ha.: de 130 a 470").

Campos categóricos sugerem os valores existentes enquanto você digita. Valores
vazios não passam em comparações, exceto em "≠", "não contém" e "vazio".
Texto é comparado sem acento e sem caixa.

### Dashboard

O conjunto analisado é o **considerado**: feições que passam nos filtros e,
havendo busca, que casam com ela. O dashboard abre na aba **Tabela**.

- **Tabela** (aba padrão, a primeira): todas as colunas com valor, 50 linhas
  por página.
  - **Ordenar:** clique no nome da coluna (de novo inverte).
  - **Filtrar coluna:** o ícone de filtro (três traços) ao lado do nome abre um filtro conforme o tipo:
    barra de intervalo (números), lista de valores para marcar com contagem e
    busca (categorias), Sim/Não/Vazio, De/Até (datas) ou "contém" (texto). Vira
    um filtro comum da camada: aparece no painel Filtros, conta no badge e
    filtra o mapa. Um filtro por coluna; **Limpar** remove. Ícone verde =
    coluna filtrada.
  - **Totais:** rodapé fixo com um operador por coluna, sobre todo o conjunto
    filtrado/buscado (não só a página): Soma, Média, Mediana, Mínimo, Máximo,
    Desvio padrão (numéricas), Preenchidos e Distintos (qualquer coluna).
    Decimais começam em Soma; inteiros (em geral códigos) e textos começam
    vazios ("—").
- **Resumo:** dois blocos lado a lado. À esquerda, o agrupamento: controles
  **Agrupar por** (só atributos do tipo categoria), **Operador** (Contagem, Soma, Média, Mínimo, Máximo) e
  **Métrica** (qualquer atributo numérico, inteiro ou decimal). Com Contagem a
  métrica não é usada e fica desabilitada. Abaixo deles, a lista dos 10 maiores
  grupos + "Outros", com valor e participação % (esta só em Contagem e Soma).
  À direita, o gráfico do mesmo resultado, com o seletor **Gráfico**. Tipos: **Barras**
  (padrão, a forma mais precisa de comparar grupos) e **Colunas** mostram os 10
  maiores grupos + "Outros" (calculado sobre os valores originais), com valor; **Barra segmentada** e
  **Rosca** mostram participação no total, só valem para Contagem e Soma (ficam
  desabilitados com Média, Mínimo e Máximo) e exibem os 5 maiores grupos +
  "Outros", com legenda. Barras e colunas usam uma cor só; a participação usa
  uma paleta categórica validada para daltonismo, com tons próprios no tema
  escuro. Passar o mouse mostra nome e valor de cada marca.
- Com o dashboard aberto, a barra flutuante do mapa (busca + Filtros) some:
  o campo de busca passa para o centro do cabeçalho do dashboard, com o termo já digitado,
  e os filtros ficam nos ícones das colunas da tabela. Ao fechar o dashboard, a
  busca volta para o mapa.
- **Altura:** arraste a alça (traço) na borda superior do dashboard; pelo
  teclado, foque a alça e use ↑/↓ (Home/End = mínimo/máximo). Duplo clique volta
  à altura padrão. A altura fica salva neste navegador.
- **Exportar CSV** exporta a tabela como está: com filtro ou busca ativos, só
  as feições filtradas, na ordem atual da tabela; sem filtro, todos os dados.
  UTF-8 com BOM. Textos que começam com `=`, `+`, `-` ou `@` recebem um
  apóstrofo para não serem executados como fórmula na planilha.
- **Exportar KML** exporta o mapa como está, para abrir no Google Earth ou no
  QGIS: as mesmas feições do CSV, com as cores do tema por categoria (uma pasta
  por categoria, na ordem e com as cores da legenda) ou a cor da camada; o
  atributo dos rótulos vira o nome de cada feição e todos os atributos vão em
  `ExtendedData`. Camadas só de contorno (Fazendas) saem sem preenchimento.
- Os arquivos levam `_filtrado` ou `_completo` no nome, conforme haja filtro ou
  busca ativos.

---

## Schema dinâmico

Na carga, cada atributo recebe um **tipo** e um **papel**:

| Papel | Regra | Uso |
| --- | --- | --- |
| `measure` | número com casas decimais | métrica no dashboard |
| `integer` | número inteiro | exibido sem separador de milhar (códigos); pode ser métrica no dashboard |
| `category` | texto com até 500 valores distintos e até 50 % de valores únicos | "Agrupar por" no dashboard, tema no mapa, sugestões no filtro |
| `text` | texto livre | busca e filtro |
| `boolean` | `true`/`false` | filtro |
| `date` | data ISO (`AAAA-MM-DD…`) | filtro por data |
| `empty` | nenhum valor preenchido | fica fora de popup, tabela e filtros |

Strings numéricas (`"125"`, `"3.5"`) são tratadas como números; com zero à
esquerda (`"0012"`), como texto.

---

## Camadas

### Catálogo

As camadas carregadas na abertura ficam em `js/config.js` (`LAYERS`):

```js
{
    id: "pol_talhoes",
    name: "Talhões",          // opcional: sem ele vale o "name" do GeoJSON
    url: "https://…/pol_talhoes.geojson",
    attribution: "…",
    color: "#f4c95d",
    visible: true,
    style: "outline",         // opcional: só contorno, sem preenchimento
    labels: { visible: true, fields: ["Fazenda"], minZoom: 13 }, // opcional: rótulo (uma linha por atributo)
    keepLast: true,           // opcional: sempre a última da lista
    interactive: false,       // opcional: camada ignora cliques (sem popup/seleção)
    icon: {                   // opcional, só para pontos: imagem no lugar do círculo
        url: "assets/icone.png",
        size: [40, 56],       // tamanho exibido
        anchor: [20, 52]      // pixel que fica sobre a coordenada (a ponta do alfinete)
    }
}
```

O catálogo atual tem três camadas, nesta ordem no painel: **Unidade
Industrial** (um ponto em lat −20,0868, lon −46,0424, desenhado com
`assets/icone_usina_canavieira.png`); **Fazendas**, só referência visual dos
limites: contorno branco fino sobre um halo escuro, sem preenchimento e sem clique
(`style: "outline"`, `interactive: false`), sempre desenhado por cima dos
talhões sem atrapalhar a seleção deles, com o número da fazenda como rótulo
ligado na abertura a partir do zoom 13 (`labels: { visible, fields, minZoom }`);
e **Talhões** (polígonos), a camada ativa na abertura (`active: true`), fixada
sempre na última posição (`keepLast: true`), mesmo com arquivos adicionados
depois. A ordem do catálogo é a ordem do painel.
Pontos com ícone esmaecem como as demais feições quando estão fora de foco.

Requisitos do arquivo: `FeatureCollection` em WGS84 (CRS84 / EPSG:4326). Um
`crs` diferente é recusado com mensagem clara. São aceitos pontos, linhas,
polígonos e suas variantes multi; feições sem geometria entram na tabela, mas
não no mapa.

A camada padrão é servida pelo próprio site, a partir de
`geojson/pol_talhoes.geojson`: uma versão otimizada (coordenadas com 6 casas
decimais, JSON compacto) do commit `225cf99` de `Lcs-993/meus_layers`. Isso
reduziu o download de 5,5 MB para 2,3 MB e evita o `raw.githubusercontent.com`,
que é lento e só guarda cache por 5 minutos. Para atualizar o dado, use
`tools/otimizar_geojson.py` (detalhes em `geojson/README.md`). URLs remotas
continuam aceitas; prefira fixá-las em um commit ou tag, porque branches como
`main` mudam sem aviso.

### Tema por categoria

O ícone de **paleta** na linha da camada colore as feições pelos valores de um
atributo do tipo **categoria** (só esse tipo pode virar tema). Abaixo da camada
aparecem a escolha do atributo e a legenda (cor, valor e quantidade).

Cada valor distinto recebe a sua própria cor; nenhum valor é agrupado ou
resumido. Os 12 mais frequentes usam uma paleta fixa de alto contraste; os
seguintes recebem cores geradas pelo ângulo de ouro no matiz, alternando
saturação e luminosidade. Vazios ficam em cinza escuro. Busca e seleção
mantêm as cores do tema: os realces mexem só em contorno e opacidade. O botão fica desabilitado
em camadas sem atributo de categoria.

### Rótulos

O ícone **T** na linha da camada liga os rótulos; abaixo dela aparece a
escolha do atributo exibido (começa no primeiro atributo do arquivo). Para
combinar atributos, **+ Adicionar linha** acrescenta outro (até 4): cada um
vira uma linha do rótulo, na ordem escolhida; o **×** remove a linha. Linhas
sem valor na feição são omitidas. O texto segue a formatação do papel de cada
atributo. No KML exportado, as linhas viram o nome da feição, unidas por " · ".

Para não pesar com milhares de feições, os rótulos são desenhados só para as
feições visíveis na tela (até 400 por vez) e sem sobreposição: o que não cabe
fica oculto até aproximar o zoom. A feição selecionada e as achadas na busca
têm prioridade. Polígonos côncavos recebem o rótulo num ponto garantidamente
interno (`js/map/label-anchor.js`), não no centroide.

### Progresso da carga

Enquanto uma camada carrega, um cartão no centro do mapa mostra o andamento:
**Carregando** com barra, MB e porcentagem durante o download e **Preparando**
enquanto os dados são lidos e o mapa é montado. Se o servidor não informar o
tamanho (ou enviar comprimido), a barra fica animada e mostra só os MB
recebidos. O cartão não bloqueia o mapa e some ao terminar; com várias camadas
ao mesmo tempo, indica quantas faltam.

### Arquivos locais

**Ferramentas › Adicionar dados** (menu da barra superior) carrega um ou mais
arquivos do computador: **GeoJSON** (`.geojson`, `.json`), **KML** e **KMZ**.
Eles são lidos no navegador e nada é enviado. Arquivos locais podem ser
removidos da lista.

KML e KMZ são convertidos para GeoJSON ao abrir (`js/data/kml.js` e
`js/data/kmz.js`, sem bibliotecas externas):

- cada `Placemark` vira uma feição, em qualquer nível de pasta;
- atributos: `name`, `description` (HTML reduzido a texto) e todos os campos
  de `ExtendedData` (`Data` e `SchemaData/SimpleData`);
- geometrias: ponto, linha, polígono com furos, `MultiGeometry` e trilhas
  `gx:Track`; a altitude é descartada;
- o encoding declarado no XML é respeitado (UTF-8, ISO-8859-1…);
- no KMZ é lido o `doc.kml` (ou o primeiro `.kml` do pacote); ícones e
  imagens internos são ignorados;
- estilos do KML (cores, ícones) não são usados: vale a simbologia da camada.

---

## Arquitetura

```text
index.html
css/style.css
geojson/                   dados servidos pelo site (versões otimizadas)
tools/otimizar_geojson.py  gera as versões otimizadas (não é publicado)
js/
├── config.js              mapa base, catálogo de camadas, constantes
├── main.js                inicialização e ligações entre módulos
├── theme.js               tema claro/escuro (script clássico, roda antes)
├── core/
│   ├── events.js          emissor de eventos
│   └── store.js           estado global e ações (fonte única de verdade)
├── data/
│   ├── geojson-provider.js  carga e validação (URL ou arquivo)
│   ├── schema.js            descoberta de tipos e papéis
│   ├── filters.js           operadores e avaliação de filtros
│   ├── search.js            índice e busca textual
│   ├── kml.js               KML → GeoJSON
│   ├── kml-export.js        gera KML tematizado (exportação)
│   ├── kmz.js               extrai o KML de dentro do KMZ (ZIP)
│   ├── stats.js             resumo e agrupamento
│   ├── theme.js             classificação do tema por categoria
│   ├── csv.js               exportação
│   └── values.js            normalização de valores
├── map/
│   ├── leaflet-view.js    único adaptador do Leaflet (feições e rótulos)
│   └── label-anchor.js    ponto interno para rótulos (geometria pura)
└── ui/
    ├── panels.js          abrir/fechar painéis, Esc, clique fora
    ├── layer-panel.js     sidebar de camadas
    ├── layer-info.js      janela Identificar (dados da camada)
    ├── filter-panel.js
    ├── search-box.js
    ├── dashboard.js       resumo, tabela e exportação
    ├── column-filter.js   filtro por coluna da tabela
    ├── dashboard-resize.js  alça de altura do dashboard
    ├── map-controls.js    enquadrar, zoom, tela cheia, mapa base
    ├── popup.js
    ├── module-menu.js     menus de módulos da barra superior
    ├── coming-soon.js     aviso "Em breve" de botões ainda sem recurso (IA)
    ├── status.js          mensagens de status (região oculta p/ leitores de tela)
    ├── loading.js         cartão de progresso da carga
    ├── charts.js          gráficos do dashboard (barras, colunas, segmentada, rosca)
    ├── format.js
    └── dom.js
```

### Fluxo

```text
config.LAYERS ─► geojson-provider ─► store.setLayerData
                                         │  schema.inferSchema
                                         │  search.buildSearchIndex
                                         ▼
   filtros / busca / seleção ─► ações do store ─► recompute (filtro → busca)
                                         │
                       eventos: layers · active · view · selection · basemap
                                         ▼
          leaflet-view · layer-panel · filter-panel · dashboard · search-box
```

- O **store** é a única fonte de verdade. Componentes não guardam estado de
  dados nem chamam uns aos outros: leem o store e reagem aos eventos.
- O **adaptador de mapa** recebe camadas e devolve interações como
  `{ layerId, uid }`, nunca objetos Leaflet. Uma migração para MapLibre deve
  reimplementar `js/map/leaflet-view.js` com a mesma interface.
- Novas fontes (FlatGeobuf, vector tiles) entram como providers irmãos de
  `geojson-provider.js` com a mesma saída `{ name, features, geometryTypes }`.

### Renderização

Um único `L.canvas()` compartilhado desenha todas as camadas. Feições filtradas
**saem do grupo** (não ficam só invisíveis), então o canvas não as percorre em
pan e zoom. Os estilos são atualizados apenas nas feições cujo estado mudou.

### Extensão

`window.WebGIS` expõe `store`, `map` (instância Leaflet) e
`addLayer(definição)`, que carrega uma camada por URL.

---

## Segurança

- Leaflet com `integrity` (SRI) e `crossorigin`.
- Content-Security-Policy em `<meta>`: scripts só do próprio site, do unpkg e
  do script de tema (por hash). Ao alterar o script inline do `<head>`,
  recalcule o hash na CSP.
- Todo texto vindo dos dados entra no DOM como `textContent`.
- CSV protegido contra injeção de fórmula.

---

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` monta `_site/` só com o que o site usa
(`index.html`, `README.md`, `css/`, `js/`, `assets/` e `geojson/`) e publica a
cada push na `main`. No GitHub: **Settings → Pages → Source: GitHub Actions**.

---

## Tema e acessibilidade

- O tema **escuro é o padrão**. O botão de tema na barra superior alterna para
  o claro; a escolha fica em `localStorage` (`webgis-theme`) e é aplicada antes
  da primeira pintura. A preferência do sistema operacional não é seguida.
- A barra superior segue o padrão do iOS: material translúcido, marca à
  esquerda e botões redondos para **Assistente de IA** (ainda "Em breve": o
  clique só mostra o aviso), Ajuda e tema à direita. No centro ficam os
  menus suspensos dos módulos (**Monitoramento**, **Operação**, **Análises** e
  **Ferramentas**), definidos em `MODULE_MENUS` (`js/config.js`) e gerados por
  `js/ui/module-menu.js`. Item sem `action` aparece como "Em breve"; hoje só
  **Ferramentas › Adicionar dados** funciona (abre um GeoJSON local). Para ligar
  um módulo: implementá-lo em `js/modules/`, tratar a action em
  `MODULE_ACTIONS` (`js/main.js`) e pôr a action no item. Os menus abrem por
  clique ou teclado (↓, ↑, ←, →, Esc) e ficam ocultos em telas de até 720 px.
  Camadas, Filtros e Dashboard abrem só pelos botões sobre o mapa.
- Painéis fechados ficam `inert`; gatilhos mantêm `aria-expanded`; abas,
  ordenação da tabela (`aria-sort`) e status (`aria-live`) são anunciados.
- Linhas da tabela são focáveis e acionáveis com `Enter`.
- Respeita `prefers-reduced-motion`.

---

## Limitações conhecidas

- O GeoJSON inteiro é baixado e lido na thread principal. Acima de algumas
  dezenas de MB, o caminho é pré-processar (reduzir precisão, simplificar) ou
  migrar para vector tiles.
- Só há suporte a WGS84; outros CRS precisam ser reprojetados antes.
- Os tiles da Esri (mapa base) exigem internet.
- Os créditos do mapa base e das camadas não aparecem no mapa (decisão do
  produto). Os termos de uso da Esri pedem atribuição visível; os textos
  continuam em `js/config.js` caso seja preciso exibi-los de novo
  (`attributionControl: true` em `js/map/leaflet-view.js`).
