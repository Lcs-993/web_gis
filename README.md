# WebGIS

Visualização interativa de dados geográficos no navegador: mapa, busca,
filtros, dashboard e tabela de atributos para **qualquer** camada GeoJSON.

A aplicação é orientada aos dados. Nenhum nome de atributo está no código:
cartão da feição, busca, filtros, dashboard, tabela e exportação são construídos a partir
do schema descoberto em cada camada no momento da carga.

HTML, CSS e JavaScript (ES modules), sem build e sem npm. A única dependência
de código é o **Leaflet 1.9.4**, via CDN com verificação de integridade (SRI).

---

## Plataforma: só desktop

O WebGIS é uma ferramenta **exclusivamente para desktop**: telas grandes,
mouse e teclado. Funciona como um **painel** para analisar e **apresentar
dados** (reuniões, telões, monitores de acompanhamento), não como site
responsivo.

- **Responsividade não é requisito.** Layout, densidade de informação e novas
  funções são pensados para telas largas (referência: 1366 px de largura ou
  mais). Não é preciso adaptar novas telas para celular ou tablet.
- O código não tem regras de tela estreita (a gaveta, o menu compacto e os
  ajustes de celular foram removidos em 08/11/2026). Não as reintroduza.
- **O uso no celular será outro produto:** um **aplicativo de campo**, que
  coleta e consulta dados no talhão e se integra a este WebGIS (os dados do
  campo chegam aqui para análise e apresentação).

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

A tela segue o ArcGIS Map Viewer: barra superior, barra de ferramentas à
esquerda (todas as ferramentas, inclusive as da camada ativa) e o mapa
ocupando o resto; os controles do mapa ficam na própria barra (grupo Navegar). As
ferramentas que mudam o mapa (Camadas, Legenda, Gráficos, Filtro,
Pesquisa avançada) abrem em **janelas flutuantes** ao lado da barra, uma de cada vez,
com a altura do conteúdo, para o efeito ficar à vista; o **Mapa base** é uma
delas (grupo Mapa). **Estilos, Rótulos e Campos** abrem a janela
**Propriedades da camada** (abaixo) na aba correspondente. **Configurações e
Sobre** abrem numa **janela central** sobre o fundo escurecido
(o resto da tela fica bloqueado; ×, `Esc` ou clique no fundo fecham, e a janela
flutuante que estava aberta continua lá). Clicar de novo no ícone fecha.
Itens marcados **Em breve** ainda não têm função e ficam desabilitados.

| Onde | O quê |
| --- | --- |
| **Barra superior** | ☰ (expande/recolhe a barra esquerda), a marca (logo + **WebGIS**) e os menus **Monitoramento**, **Operação**, **Análises**, **Ferramentas** e **Ajuda**. À direita: tema claro/escuro e o botão **Apresentar** (tecla F): tela cheia **sem as barras** — ficam só o mapa, a caixa de busca e os controles. Levar o mouse até o topo ou a borda esquerda traz a barra de volta por cima do mapa, e ela some de novo quando o mouse sai (fica enquanto um menu dela está aberto). Puxadores discretos no topo e na borda esquerda mostram onde as barras estão, um aviso rápido explica isso ao entrar, e a janela aberta à esquerda abre espaço quando a barra aparece. Para sair: Esc, F ou "Sair" na barra superior |
| **Menus** (estilo macOS Big Sur) | Linhas compactas com ✓ à esquerda e o atalho (ou › de submenu) à direita. Análises inclui também Análise espacial. Ferramentas reúne Buscar (Ctrl+K), Pesquisa avançada…, Propriedades da camada…, Estilos…, Rótulos…, Medir, Desenho, Outras ferramentas e Configurações…. Mapa reúne Adicionar camada…, Salvar mapa, Favoritos, Exportar KML, Imprimir mapa, Compartilhar, Incorporar e Aplicativos. Exibir reúne Mapa base ›, Aparência › (tema e "Reduzir transparência"), Barra lateral expandida ( `[` ) e Apresentar (F). Teclado: ↑ ↓ percorrem, → abre o submenu, ← volta, Esc fecha |
| **Barra esquerda** | Blocos por função, separados por divisória (com a barra expandida, cada um mostra o título). *Mapa:* **Camadas**, Adicionar camada e **Legenda**. *Consultar:* **Pesquisar** (abre a **Pesquisa avançada**) e **Filtro** (com o número de filtros). *Camada:* **Propriedades**, **Estilos** (tema por categoria ou por faixas de valor, rampa de cores, classes e legenda), **Rótulos**, **Campos** (atributos, tipo e % preenchido), Pop-ups e Efeitos. *Analisar:* **Tabela de atributos** e **Gráficos** (Analytics). A camada ativa se escolhe clicando no nome dela no painel **Camadas**. Os itens da camada ficam desabilitados sem camada pronta. No pé, **Conta** (o cartão abre ao lado da barra e traz as **notificações**; um sininho na cor de acento aparece no canto do ícone quando há novidade e some ao abrir o cartão), **Configurações** e **Sobre**. O botão » do rodapé (ou a tecla `[`) mostra os rótulos; a escolha fica salva. As ferramentas do mapa abrem em janelas flutuantes ao lado dela; Configurações, Sobre, Campos e Propriedades, em janela central. **Propriedades** (feições, geometria, CRS, extensão, metadados) abrem pelo **i** da camada no painel Camadas |
| **Sem barra direita** | Removida: os controles do mapa ficam na barra esquerda. Desenho, Análise, Salvar mapa, Favoritos, Compartilhar, Incorporar, Aplicativos e Imprimir ficam nos menus **Análises** e **Ferramentas** |
| **Camadas** (painel) | Lista agrupada no padrão da janela Propriedades: cada camada em duas linhas (nome sobre "Polígonos · 3.388 feições"), seleção da ativa em cinza com a etiqueta **Ativa**. Mostra/oculta camadas (olho, sempre à vista), liga/desliga os rótulos (**T**) e abre as **Propriedades da camada** (botão de controles, ou duplo clique no nome); T e controles aparecem ao passar o mouse. Clique no nome escolhe a **camada ativa**; o **+** do cabeçalho adiciona camada. Etiqueta **Tema** indica tema ligado |
| **Controles do mapa** (barra esquerda) | **Mapa base** (grupo Mapa: painel com as miniaturas Satélite e Ruas) e, no grupo **Navegar**, **Minha localização**, **Início** (extensão total das camadas ligadas, mesmo com filtros) e **Zoom** + / − (teclas + e −) |
| **Busca** | Pílula **sempre à vista** no canto superior direito do mapa; Ctrl+K leva o foco até ela. O botão **Pesquisar** da barra esquerda abre a **Pesquisa avançada** (campos, correspondência, E/OU, enquadrar). O funil abre o menu de filtros: painel de filtros, filtros ativos (clique remove), "todas"/"qualquer uma", filtros salvos e limpar |
| **Botão direito** no mapa | No vazio: copiar coordenadas, centralizar aqui, medir (Em breve). Sobre uma feição: informações, aproximar, exportar só ela em KML e registrar ocorrência › (Em breve). Pelo teclado: Shift+F10 com o mapa em foco |
| **Analytics** (Tabela de atributos ou Gráficos) | Resumo (indicadores do conjunto atual, distribuição por valor e gráfico) e tabela ordenável e paginada; exportação CSV e KML. Com ele aberto, a feição selecionada aparece no mesmo cartão à direita do mapa |
| **Gráficos** (painel) | "Adicionar gráfico" e os tipos (Barras, Pizza; Linhas, Histograma, Dispersão e Box plot em breve). Abre o Resumo do Analytics com o tipo escolhido |
| Clique numa feição | Seleciona e mostra a feição no **cartão à direita do mapa** (abaixo da busca e acima dos controles; não cobre mais a feição, e o mapa enquadra fora dele): título, medidas em destaque com mini-gráfico da posição entre o mínimo e o máximo da camada, atributos em duas colunas, vazios recolhidos e os botões **Aproximar** e **Ver na tabela**. O × (ou Esc) fecha e limpa a seleção; com o Analytics aberto, a tabela vai até a linha da feição e o × só esconde o cartão |
| Clique numa linha da tabela | Seleciona e enquadra a feição no mapa. **Ctrl** (⌘) + clique acrescenta/retira linhas; **Shift** + clique seleciona o intervalo desde a última linha clicada (Ctrl + Shift soma ao que já estava). Com várias selecionadas: todas ganham o destaque de seleção, o mapa enquadra todas, o cartão da feição não aparece e o Analytics mostra "N selecionadas" |
| Feição em várias partes | Com busca ativa, clicar numa parte de um talhão seleciona todas as partes achadas com a mesma Fazenda e o mesmo Talhão (`partFields` da camada em `js/config.js`); o cartão mostra a parte clicada |
| **Configurações** | Tema (o mapa base acompanha: claro → Ruas, escuro → Satélite), "Reduzir transparência" (vidro sem desfoque, mais leve; ligado por padrão no tema claro, guardado por tema) e lista de atalhos |
| `Esc` | Fecha o menu ou o painel aberto mais recente; na busca, limpa o termo (com o campo vazio, sai do campo) |
| **Rodapé** | Status (ponto na cor de sucesso; laranja pulsando enquanto carrega), coordenadas do cursor (ou do centro) e zoom, à direita. As fontes dos dados ficam no **Sobre** |
| Carregamento | Esqueletos (blocos pulsando) em painéis, lista de camadas e tabela; se uma camada falha, um cartão sobre o mapa diz qual e por quê, com **Tentar de novo** |

Busca, filtros, estilos, rótulos, campos e Analytics operam sobre a **camada ativa** (escolhida pelo nome no painel Camadas).
O mapa mostra todas as camadas ligadas.

### Atalhos de teclado

| Tecla | Ação |
| --- | --- |
| `Ctrl` + `K` (⌘K) | Leva o foco à caixa de busca |
| `F` | Apresentar: tela cheia sem as barras (entra e sai) |
| `+` / `−` | Zoom |
| `[` | Expande/recolhe a barra esquerda |
| `Esc` | Fecha o menu ou o painel aberto |
| `Shift` + `F10` | Menu de contexto do mapa (com o mapa em foco) |
| ↑ ↓ / Home End | Navegam nas barras e nos menus; → e ← entram e saem dos submenus |

Os atalhos de uma letra não valem enquanto se digita num campo.

### Aparência

Tokens de design em `css/style.css` (seção 0): vidro fosco (`--glass-*`),
texto, acento, alertas, raios (20/14/8 px e pílula), ícones e movimento.
O tema escuro é o padrão; no escuro o acento é o verde Bambuí (`#5cb83f`, texto
escuro por cima) e no claro é azul (`#0071e3`). As cores das camadas não
dependem do tema. O **mapa base acompanha o tema**: claro abre em Ruas e escuro em
Satélite (`THEME_BASEMAPS` em `js/config.js`); depois o usuário pode trocar em
Mapa base. **Reduzir transparência** (Configurações) tira o desfoque do
vidro. A escolha é guardada **por tema**: no claro vem **ligado** por padrão
(o vidro claro desfocado sobre o mapa perde contraste) e no escuro, desligado;
trocar de tema aplica a escolha do tema novo (chaves `webgis-sem-blur-claro` e
`webgis-sem-blur` no `localStorage`, com "1" ou "0"). O mesmo modo liga sozinho
em navegadores sem `backdrop-filter`.

### Ícones

Ícones da interface em `assets/icons/ui/` (`sprite.svg` e os `ic-*.svg`
avulsos), usados com `<svg class="icon"><use href="#ic-camadas-ui"/></svg>`.
O sprite fica embutido no `index.html` (funciona sem requisição extra); depois
de editar o `sprite.svg`, rode `python tools/embutir_sprite.py`. A linha usa
`currentColor`; o preenchimento claro, `--icon-fill`; o fundo interno,
`--icon-bg`.

Marcadores ilustrados do mapa (usina, daninhas, pragas, fogo, chuva, vento):
`criarIconeMapa(nome, altura)` em `js/map/marker-icons.js` calcula tamanho e
âncora a partir do PNG (arquivos em `assets/png/`; a usina, em `assets/sgv/`). Ao
trocar uma imagem, atualize a largura e a altura na tabela do arquivo.

### Busca

- Todos os termos precisam aparecer na feição, em qualquer atributo
  pesquisável (todos, exceto medidas numéricas com decimais).
- Termos numéricos casam com números inteiros: `22` acha `22`, não `122`.
- Acento, caixa e pontuação são ignorados (`olhos d'água` = `OLHOS DAGUA`).
- Sem resultado exato, uma segunda passada compara o termo sem espaços.
- `Enter` busca na hora; a digitação tem *debounce* de 160 ms.
- **Pesquisa avançada** (botão Pesquisar da barra esquerda, ou Ferramentas ›
  Pesquisa avançada…), por camada, para a mesma caixa de busca:
  - **Correspondência:** *Contém* (padrão, as regras acima), *Começa com*
    (alguma palavra do valor começa com o termo) ou *Valor exato* (o valor
    inteiro de um campo é igual ao termo).
  - **Termos:** *Todos (E)* ou *Qualquer um (OU)*: `22 23` com OU acha os dois.
    No valor exato com OU, cada termo é um valor.
  - **Campos pesquisados:** marque só os atributos onde procurar (Todos/Nenhum).
  - **Enquadrar os resultados:** desligue para o mapa não se mover a cada busca.
  - O painel mostra o termo atual e quantos resultados ele dá com os ajustes;
    "Restaurar o padrão" volta a contém, E, todos os campos e enquadrar.
  - A passada tolerante (sem espaços) só vale no *Contém* com *Todos (E)*.
- No mapa, os achados ficam mais intensos e o resto da camada quase some (só um
  vestígio da forma, sem rótulo). Nenhum realce de cor: funciona com qualquer tema.

### Seleção

Contorno dos polígonos (camadas com preenchimento): linha branca fina e
translúcida (`POLYGON_STROKE*` em `js/map/leaflet-view.js`), igual com ou sem
tema, só para marcar as divisas; a cor fica no preenchimento.

Busca e seleção são dois níveis separados:

- **Busca:** os achados ficam mais intensos que o normal e o que não casa
  quase some (só um vestígio da forma, sem rótulo). Enquanto a busca está
  ativa, as **outras camadas** (Fazendas, Unidade Industrial, arquivos) também
  esmaecem por inteiro e ficam sem rótulo.
- **Seleção** (clique no mapa ou na tabela), um nível acima: as selecionadas
  ganham contorno branco forte e preenchimento mais intenso, na própria cor
  (da camada ou do tema). A seleção não esmaece nada; com busca ativa, a
  selecionada se destaca sobre os achados. Ícones de ponto selecionados ganham
  um halo branco.

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

**Várias condições:** com duas ou mais, escolha se a feição precisa atender a
**todas** (E) ou a **qualquer uma** (OU); entre as etiquetas aparece "e" ou
"ou". O modo vale para todos os filtros da camada, inclusive os de coluna.

**Filtros salvos:** **Salvar…** guarda o conjunto atual com um nome, por
camada, neste navegador (`localStorage`, chave `webgis-saved-filters`). Um
clique no nome reaplica o conjunto (condições de atributos que não existem mais
são ignoradas); o **×** exclui.

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
  QGIS: as mesmas feições do CSV, com as cores do tema (uma pasta por valor ou
  faixa, na ordem e com as cores da legenda) ou a cor da camada; o
  atributo dos rótulos vira o nome de cada feição e todos os atributos vão em
  `ExtendedData` (para o QGIS) e num balão HTML legível no Google Earth
  (título, camada, faixa na cor da feição e tabela de atributos, sem os links
  "Rotas" do balão padrão). Camadas só de contorno (Fazendas) saem sem preenchimento.
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
| `empty` | nenhum valor preenchido | fica fora do cartão da feição, da tabela e dos filtros |

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
    interactive: false,       // opcional: camada ignora cliques (sem cartão/seleção)
    icon: especificacaoIcone("usina", 56), // opcional, só para pontos: marcador ilustrado
    // ou outra imagem: { url: "assets/png/minha.png", size: [40, 56], anchor: [20, 52] }
}
```

O catálogo atual tem três camadas, nesta ordem no painel: **Unidade
Industrial** (um ponto em lat −20,0868, lon −46,0424, desenhado com
`assets/sgv/icone_usina_canavieira.png`); **Fazendas**, só referência visual dos
limites: contorno branco fino sobre um halo escuro, sem preenchimento e sem clique
(`style: "outline"`, `interactive: false`), sempre desenhado por cima dos
talhões sem atrapalhar a seleção deles, com o número da fazenda como rótulo
ligado na abertura a partir do zoom 13 (`labels: { visible, fields, minZoom }`);
e **Talhões** (polígonos), a camada ativa na abertura (`active: true`), fixada
sempre na última posição (`keepLast: true`), mesmo com arquivos adicionados
depois. A ordem do catálogo é a ordem do painel.
Pontos com ícone esmaecem como as demais feições fora da busca e ganham halo branco quando selecionados.

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

### Propriedades da camada

Uma janela só para tudo o que é de uma camada, organizada como as propriedades
de camada do ArcGIS e desenhada como os Ajustes do macOS: barra lateral de
seções, formulário agrupado e controles no tamanho do desktop. Abre pelo botão
de controles na linha da camada, por **duplo clique no nome**, pelos botões
**Propriedades**, **Estilos**, **Rótulos** e **Campos** do bloco *Camada* da
barra esquerda ou pelo menu Ferramentas (estes, para a camada ativa). O seletor
do cabeçalho troca de camada sem fechar.

| Aba | O quê |
| --- | --- |
| **Informação** | Feições, geometria, origem, sistema de coordenadas, extensão e metadados (GeoJSON + `.qmd` do QGIS) |
| **Simbologia** | **Estilo** (controle segmentado: símbolo único, categorias, graduado, com amostra do símbolo); **Símbolo** (preenchimento ligado/desligado, cor e opacidade do preenchimento, cor e espessura do contorno; em linhas, cor e espessura; em pontos, cor, tamanho e contorno); ajustes do tema; **Opacidade** da camada |
| **Rótulos** | Ligar, atributos (um por linha), texto (tamanho, cor, negrito, halo) e zoom mínimo |
| **Campos** | Atributos com tipo e percentual preenchido |

A janela **não é modal**: o mapa fica à vista e muda a cada ajuste. **Cancelar**
desfaz tudo o que foi mudado desde que ela abriu (em todas as camadas mexidas);
**OK**, **×** e `Esc` mantêm. **Restaurar padrão** volta a aba atual ao padrão
da camada. Arrasta pelo cabeçalho; em telas estreitas ocupa a área do mapa, com
as abas no topo. As mudanças valem para a sessão (não são gravadas).

No código: `layer.color` é a cor principal e `layer.symbol` guarda só o que o
usuário mudou (`js/data/symbol.js`, `resolveSymbol`); `store.setSymbol` emite
`symbol` e o mapa repinta (`mapView.setSymbol`). Camadas de ponto com ícone de
imagem só aceitam a opacidade.

### Tema (por categoria ou por faixas de valor)

Em **Propriedades da camada › Simbologia**, o **Tipo** *Categorizado* ou
*Graduado* colore as feições por um atributo. O tipo do atributo decide:

- **Categoria** (ex.: Variedade): cada valor distinto recebe a sua própria cor;
  nenhum valor é agrupado ou resumido. Na **paleta padrão**, os 12 mais
  frequentes usam cores fixas de alto contraste e os seguintes recebem cores
  geradas pelo ângulo de ouro no matiz. Com uma **rampa**, as cores seguem a
  ordem natural dos valores, da primeira à última cor da rampa.
- **Número** (ex.: Área (ha.), produtividade): os valores são divididos em
  **classes** (o usuário digita quantas, de 1 a 32) por **quebras naturais
  (Jenks)**, **quantis** (o mesmo número de feições em cada classe),
  **intervalos iguais** ou **manual**, e cada classe recebe uma cor da rampa,
  do menor ao maior valor. Dados com muitos valores iguais podem gerar menos
  classes que o pedido (o painel avisa). Acima de 4.000 feições, o Jenks usa
  uma amostra regular dos valores ordenados.
- **Limites digitados (manual):** na aba Simbologia, cada classe mostra o limite
  inferior e o superior em campos editáveis (aceitam vírgula decimal; Enter
  confirma). Digitar um limite passa a classificação para **Manual**, partindo
  das classes que estavam na tela. Se o limite era compartilhado com a classe
  vizinha, ela acompanha (as classes seguem contíguas); valores que não caem
  em nenhuma classe aparecem como **(fora das classes)**, em cinza claro. Um
  valor igual a um limite compartilhado fica na classe de baixo. Mudar o
  número de classes no manual refaz classes de mesma largura entre o menor e o
  maior limite. Os limites valem só para o atributo em que foram digitados;
  escolher outro método volta ao cálculo automático.

Na aba **Simbologia** fica a personalização: atributo (separado em
"Categorias" e "Valores numéricos"), **Cores** (lista de rampas com amostra,
agrupadas em sequenciais, divergentes e multimatiz), **Inverter cores** e, nos
números, **Classificação**, **Classes** (digitado) e os **limites** de cada classe. Cada tipo guarda as próprias escolhas:
trocar de atributo e voltar mantém a rampa. Os valores iniciais ficam em
`THEME_DEFAULTS` (`js/config.js`): categorias na paleta padrão; números na rampa
41 invertida (vermelho no menor, verde no maior), 5 classes por Jenks.

A legenda (aba Simbologia e painel Legenda) mostra cada valor ou faixa
com a cor e a quantidade. Vazios ficam em cinza escuro. O painel Legenda segue
o padrão do painel Camadas: um grupo só, cada camada com o nome sobre o tipo e
a quantidade ("Polígonos · 3.388 feições" ou "Por atributo · …" com tema).
Acima de 12 categorias, as cores são geradas com saturação contida, no tom da
paleta terrosa. Busca e seleção mantêm
as cores do tema: os realces mexem só em contorno e opacidade. O botão fica
desabilitado em camadas sem atributo de categoria nem numérico.

As rampas vêm de `assets/rampas_de_cores/rampas.js` (rampas do ArcMap
convertidas pelo `converter_rampas.py` da mesma pasta; ver o README dela), que
o `index.html` carrega antes do app. Para acrescentar rampas, coloque o `.xml`
do QGIS em `fontes/` e rode o conversor: elas aparecem no seletor sem mexer no
código (`js/data/ramps.js` lê `window.RAMPAS`).

### Rótulos

Em **Propriedades da camada › Rótulos**, **Mostrar rótulos** liga os rótulos
(só uma camada rotulada por vez: ligar numa desliga na outra). Na mesma aba
ficam o **texto** (tamanho de 8 a 24 px, cor, negrito e halo, que é escuro sob
letra clara e claro sob letra escura), o **zoom mínimo** e a
escolha do atributo exibido (começa no primeiro atributo do arquivo). Para
combinar atributos, **+ Adicionar linha** acrescenta outro (até 4): cada um
vira uma linha do rótulo, na ordem escolhida; o **×** remove a linha. Linhas
sem valor na feição são omitidas. O texto segue a formatação do papel de cada
atributo. No KML exportado, as linhas viram o nome da feição, unidas por " · ".

Feições escondidas por filtro ou esmaecidas pela busca ficam sem rótulo (as
selecionadas sempre têm). Para não pesar com milhares de feições, os rótulos são desenhados só para as
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

**Adicionar camada** (barra esquerda) carrega um ou mais arquivos do
computador: **GeoJSON** (`.geojson`, `.json`), **KML** e **KMZ**.
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
ajuda.html                 guia de uso (botão Ajuda)
css/style.css
geojson/                   dados servidos pelo site (versões otimizadas)
tools/otimizar_geojson.py  gera as versões otimizadas (não é publicado)
tools/embutir_sprite.py    embute assets/icons/ui/sprite.svg no index.html
assets/icons/ui/           ícones da interface (sprite.svg e ic-*.svg)
assets/rampas_de_cores/    rampas de cores do tema (rampas.js, conversor e fontes)
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
│   ├── search.js            índice e busca textual (padrão e pesquisa avançada)
│   ├── kml.js               KML → GeoJSON
│   ├── kml-export.js        gera KML tematizado (exportação)
│   ├── kmz.js               extrai o KML de dentro do KMZ (ZIP)
│   ├── stats.js             resumo e agrupamento
│   ├── theme.js             tema do mapa: por categoria ou por faixas de valor
│   ├── ramps.js             rampas de cores (cores, amostra e quebras de classe)
│   ├── csv.js               exportação
│   └── values.js            normalização de valores
├── map/
│   ├── leaflet-view.js    único adaptador do Leaflet (feições, rótulos, cliques e botão direito)
│   ├── marker-icons.js    criarIconeMapa(): marcadores ilustrados (usina, ocorrências, clima)
│   └── label-anchor.js    ponto interno para rótulos (geometria pura)
└── ui/
    ├── panels.js          abrir/fechar painéis, Esc, clique fora
    ├── toolbar.js         barra esquerda (expandir, indicador, dicas)
    ├── layer-panel.js     painel Camadas (+ blocos de rótulo, tema e símbolo)
    ├── layer-properties.js janela Propriedades da camada (abas, Cancelar/OK, arrastar)
    ├── layer-style.js     abas Simbologia e Rótulos (editores da aparência)
    ├── layer-info.js      abas Informação e Campos
    ├── layer-tools.js     painel Pesquisa avançada
    ├── legend-panel.js    painel Legenda
    ├── charts-panel.js    painel Gráficos
    ├── app-panels.js      Configurações, créditos do Sobre, notificações (sininho da Conta)
    ├── menu.js            componente de menu (estilo macOS Big Sur)
    ├── context-menu.js    botão direito no mapa
    ├── filter-menu.js     menu do funil da busca
    ├── skeleton.js        esqueletos de carregamento e estados de erro
    ├── filter-panel.js
    ├── search-box.js      caixa de busca sempre à vista (Ctrl+K leva o foco)
    ├── dashboard.js       resumo, tabela e exportação
    ├── export-png.js      exporta um card do Analytics como PNG
    ├── column-filter.js   filtro por coluna da tabela
    ├── dashboard-resize.js  alça de altura do dashboard
    ├── map-controls.js    Mapa base, localização, início, zoom e modo Apresentar
    ├── feature-card.js    cartão da feição, à direita do mapa
    ├── popup.js           conteúdo do cartão da feição (título, medidas, atributos)
    ├── module-menu.js     barra de menus da barra superior
    ├── coming-soon.js     cartões "Em breve" (como o Entrar da Conta)
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
- Barras e menus: ver **Uso**. Os menus vêm de `MODULE_MENUS` (`js/config.js`)
  e usam o componente `js/ui/menu.js`. Item sem `action` nem submenu aparece
  como "Em breve". Para ligar um módulo: implementá-lo em `js/modules/`, tratar
  a action em `MODULE_ACTIONS` (`js/main.js`) e pôr a action no item.
- **Ajuda:** `ajuda.html` é o guia de uso (camadas, rótulos e tema, busca,
  filtros, seleção, dashboard, exportação, controles, arquivos, módulos e
  teclado), com o mesmo visual e tema do mapa. Este README é a documentação
  técnica. Ao mudar um comportamento, atualize os dois.
- Painéis fechados ficam `inert`; gatilhos mantêm `aria-expanded`; abas,
  ordenação da tabela (`aria-sort`) e status (`aria-live`) são anunciados.
- Botões só com ícone têm `aria-label`; nas barras, a dica aparece também com o
  foco do teclado. Foco visível na cor de acento. Contraste AA nos dois temas.
- Linhas da tabela são focáveis e acionáveis com `Enter`.
- Respeita `prefers-reduced-motion`.

---

## Limitações conhecidas

- O GeoJSON inteiro é baixado e lido na thread principal. Acima de algumas
  dezenas de MB, o caminho é pré-processar (reduzir precisão, simplificar) ou
  migrar para vector tiles.
- Só há suporte a WGS84; outros CRS precisam ser reprojetados antes.
- Os tiles da Esri (mapa base) exigem internet.
- Os créditos do mapa base e das camadas não aparecem no mapa nem no rodapé
  (decisão do produto); ficam no **Sobre**. Os termos de uso da Esri pedem atribuição visível; os textos
  continuam em `js/config.js` caso seja preciso exibi-los de novo
  (`attributionControl: true` em `js/map/leaflet-view.js`).
