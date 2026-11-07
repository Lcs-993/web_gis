# DIAGNÓSTICO TÉCNICO DO WEBGIS

**Data:** 06/11/2026
**Escopo analisado:** working tree da branch `main` (inclui alterações não commitadas), commit `fc810f4` (HEAD) para comparação, `README.md`, `geojson/README.md`, `RELATÓRIO DE ENTENDIMENTO DO PROJETO.md`, `.github/workflows/pages.yml`, `index.html`, `css/style.css`, `js/map.js`, `js/navigation.js`, `js/theme.js` e o GeoJSON remoto baixado em 06/11/2026.
**Método:** leitura estática do código e inspeção do dado. **A aplicação não foi executada no navegador**; os itens marcados como *bug provável* decorrem da leitura do código e devem ser confirmados em execução.
**Nenhuma alteração de código foi feita.**

---

## 1. Resumo Executivo

1. **Existem duas versões da aplicação.** O commit `fc810f4` (HEAD) tem campos agrícolas fixos (`TALHOES_CAMPOS`, busca `fazenda,talhão`). O working tree (não commitado: `git diff --stat` mostra +2.389/−901 linhas em `map.js`, `index.html` e `style.css`) substituiu isso por descoberta dinâmica de schema. Este diagnóstico avalia o **working tree**; o que estiver publicado hoje no GitHub Pages corresponde, no máximo, ao HEAD. O repositório local **não tem remote configurado** (`git remote -v` vazio), então não foi possível confirmar o que está publicado.

2. **O dado já mudou de schema, e isso confirma o problema na prática.** O GeoJSON remoto tem hoje **15,7 MB e 3.343 feições** (o README diz 4,4 MB e 3.292). Os atributos atuais são `variedade`, `Talhão`, `Fazenda`, `Proprietário`, `Origem da Cana`, `Vencimento do Contrato (Ano)` e `Valor por ha.`. Os campos que o HEAD exige (`fazenda`, `talhao`, `desc. fazenda`, `proprietario`, `area`) **não existem mais**. Com esse dado, popup, busca e estatísticas do HEAD quebram. O working tree sobrevive à mudança porque lê o schema em tempo de execução.

3. **Popup, tabela, filtros e exportação já são orientados a schema** no working tree (`descobrirSchema`, `map.js:676`). **O que ainda impede a generalização:**
   - **Camada única e fixa:** URL, estilo, checkbox, atribuição e textos são de "Talhões" (`map.js:228-293`).
   - **Estado fragmentado:** existe `applicationState`, mas metade do estado fica em variáveis soltas.
   - **Só funciona com polígonos e linhas:** um GeoJSON de **pontos quebra** a aplicação (`setStyle`/`getBounds` em `L.Marker`).
   - **Dashboard não analisa os dados:** mostra a quantidade de campos por tipo e soma qualquer número, inclusive identificadores.
   - **Rótulos agrícolas no HTML** (`Por Variedade`, `Por Fazenda`, `Talhões`, IDs `stats-variedade`, `analytics-fazendas`).

4. **Riscos principais:** dado remoto mutável numa branch `main` de terceiro, sem versão nem verificação; Leaflet via unpkg sem SRI; CSV exportado sem proteção contra injeção de fórmula; `Database1.accdb` versionado no HEAD (fica no histórico do Git e é publicado pelo workflow se fizer push).

5. **Escala:** 352 mil vértices em 15,7 MB num único `fetch` + `JSON.parse`, com repaint O(N) a cada clique e a cada busca. É aceitável no volume atual, mas o arquivo **quase quadruplicou** sem nenhuma alteração no código, e não existe estratégia de carga incremental.

---

## 2. Arquitetura Atual

### 2.1 Arquivos e responsabilidades

| Arquivo | Linhas | Responsabilidade | Observação |
|---|---|---|---|
| `index.html` | 772 | Marcação de topbar, sidebar, mapa, busca, filtros, controles e dashboard | 4 blocos com `style=""` inline (`:172`, `:177`, `:398`, `:368`); rótulos de domínio fixos |
| `js/theme.js` | 120 | Tema claro/escuro e `localStorage` | Isolado e coeso; sem acoplamento com o mapa |
| `js/navigation.js` | 348 | Dropdowns, sidebar, teclado, `Escape` | Coeso; registra `click`/`keydown` globais no `document` (`:215`, `:326`) |
| `js/map.js` | 1.865 | **Tudo o resto:** mapa, basemaps, controles, carga do GeoJSON, schema, estilos, seleção, popup, busca, filtros, estatísticas, dashboard, CSV | **Monólito**: um único closure de `DOMContentLoaded` (`:10` a `:1864`) |
| `css/style.css` | 2.372 | Tokens, layout, componentes e responsividade | Inclui seletores de domínio (`.talhao-popup`, `:901-926`) |
| `.github/workflows/pages.yml` | 39 | Deploy da **raiz inteira** (`path: .`) | Publica README, relatórios, `assets/_originais` e qualquer arquivo versionado |

### 2.2 Módulos lógicos dentro de `map.js`

Não existem módulos ES nem namespaces. As "seções" são apenas blocos de comentário dentro do mesmo closure:

| Seção | Linhas | Principais símbolos |
|---|---|---|
| Rodapé/status | 23-54 | `setFooterStatus`, `setMapStatus` |
| Mapa e basemaps | 83-216 | `map`, `MAPAS_BASE`, `mapaBaseAtual` |
| Estilos da camada | 228-286 | `TALHOES_URL`, `TALHOES_ESTILO*` |
| Estado | 288-303 | `talhoesCamada`, `talhaoAtivo`, `talhoesVisivel`, `selecaoPorBusca`, `applicationState` |
| Controles | 315-583 | Home, zoom, tela cheia, menu de mapa base |
| Schema | 641-709 | `inferirTipo`, `descobrirSchema` |
| Filtros (avaliação) | 729-773 | `camadaPassaFiltros`, `obterCamadasConsideradas` |
| Render/seleção | 783-891 | `repintar`, `limparSelecao`, `mostrarPopup` |
| Visibilidade e carga | 894-1039 | `aplicarVisibilidade`, `carregarTalhoes` |
| Busca | 1051-1576 | `normalizar`, `construirIndiceBusca`, `encontrar`, `rodarBusca` |
| Estatísticas/dashboard | 1241-1409 | objeto `estatisticas` |
| Filtros (UI) | 1598-1763 | `criarControlesFiltros`, `aplicarFiltros`, `inicializarFiltros` |
| Dashboard (toggle) | 1770-1813 | listeners do rodapé |
| Exportação | 1816-1863 | `exportarCsv` |

### 2.3 Acoplamento

- **Dependência por ordem de declaração.** `aplicarVisibilidade` (`:894`) chama `aoDesligarCamada`, um "gancho" `let` definido em `:619` e atribuído em `:1570`, porque a busca é declarada depois. `carregarTalhoes` (`:941`) usa `criarControlesFiltros` e `aplicarFiltros`, que são declarados depois (`:1598`, `:1727`). Funciona só porque a carga é adiada por `setTimeout(carregarTalhoes, 0)` (`:1592`) e por isso as `const` já estão inicializadas quando ela roda. É um acoplamento temporal frágil.
- **DOM acoplado à lógica.** `estatisticas._atualizarUI` (`:1277`) busca 11 IDs fixos via `getElementById` a cada cálculo e mistura cálculo com renderização.
- **Três handlers de clique no `document` disputam o mesmo evento:** `navigation.js:215`, `map.js:1749` (painel de filtros) e `map.js:1794` (dashboard). Há também dois handlers globais de `Escape` (`navigation.js:326`, `map.js:1805`).

---

## 3. Fluxo de Dados

```text
index.html
 └─ <script> Leaflet 1.9.4 (unpkg, sem SRI)            index.html:764
 └─ js/map.js  DOMContentLoaded                         map.js:10
     ├─ L.map + tileLayer Esri                          map.js:103-183
     ├─ window.WebGIS = { map, state }                  map.js:1585
     └─ setTimeout(carregarTalhoes, 0)                  map.js:1592
          ├─ fetch(TALHOES_URL) → response.json()       map.js:951-957
          ├─ valida type === FeatureCollection          map.js:975-984
          ├─ L.geoJSON(dados, {renderer: L.canvas(),    map.js:986-989
          │                    style: TALHOES_ESTILO})
          ├─ descobrirSchema(dados.features)            map.js:990
          │    └─ applicationState.schema / allFeatures
          ├─ criarControlesFiltros()                    map.js:991
          ├─ talhoesCamada.on("click") → mostrarPopup   map.js:1000-1007
          ├─ construirIndiceBusca()                     map.js:1011
          ├─ aplicarVisibilidade()                      map.js:1017
          ├─ aplicarFiltros() → repintar() +            map.js:1018 / 1727
          │                     estatisticas.calcular()
          └─ fitBounds                                  map.js:1031
```

**Onde os atributos ficam:** só em `feature.properties`, sem cópia nem normalização. Ficam acessíveis por dois caminhos: `layer.feature.properties` (Leaflet) e `applicationState.allFeatures` (mesmos objetos, `:706`).

**Quem lê atributos:** apenas `getAttribute(feature, name)` (`:725`) e `Object.entries(propriedades)` no popup (`:858`). O índice de busca lê `propriedades[campo.name]` (`:1134`). Nenhum acesso usa nome literal de campo.

**Fluxos derivados:**

| Evento | Caminho | Atualiza mapa | Atualiza dashboard/tabela |
|---|---|---|---|
| Filtro adicionado/removido | `aplicarFiltros` → `repintar` + `estatisticas.calcular` | sim | sim |
| Busca | `rodarBusca` → `repintar` (`:1488`) | sim | **não** (bug provável, ver 6.4) |
| Limpar busca | `limparBusca` → `repintar` (`:1438`) | sim | **não** |
| Abrir dashboard | `estatisticas.calcular` (`:1783`) | — | sim (recalcula ao abrir) |
| Clique em feição | `mostrarPopup` → `repintar` ×2 (`:883`, `:885`) | sim | não (`selectedFeature` nunca é gravado) |

---

## 4. Dependências de Campos Fixos

### 4.1 Acesso a atributos por nome literal — working tree

Busquei `properties.`, `properties[` e `getAttribute(` em `js/`. **Nenhum acesso por nome literal de atributo foi encontrado no working tree.** Todos os acessos são parametrizados:

| Local | Trecho | Situação |
|---|---|---|
| `map.js:680` | `Object.keys(feature.properties \|\| {})` | dinâmico |
| `map.js:687` | `feature.properties[name]` (`name` vem do schema) | dinâmico |
| `map.js:726` | `feature.properties[name]` em `getAttribute` | dinâmico |
| `map.js:858` | `Object.entries(propriedades)` no popup | dinâmico |
| `map.js:1134` | `propriedades[campo.name]` no índice de busca | dinâmico |

### 4.2 Acesso por nome literal — HEAD (`fc810f4`), para comparação

| Local (HEAD) | Trecho |
|---|---|
| `map.js:256-268` | `TALHOES_CAMPOS` com `talhao`, `desc. fazenda`, `fazenda`, `proprietario`, `variedade`, `area` (com `decimais: 2`, `unidade: " ha"`, `searchable: false`) |
| `map.js:738-746` | busca `fazenda,talhão` → `{ fazenda, talhao }` |
| `map.js:775-776` | `propriedades.fazenda`, `propriedades.talhao` no índice |
| `map.js:806-809` | `item.fazenda === consultaPorCodigo.fazenda`, `item.talhao === …` |

Com o GeoJSON atual, **nenhum desses campos existe** (o dado agora usa `Fazenda` e `Talhão`, com maiúscula e acento), então o HEAD exibiria popups vazios e a busca por código não funcionaria.

### 4.3 Dependências de domínio ainda presentes (UI, nomes e texto) — working tree

Não são acessos a atributos, mas amarram a aplicação ao caso "talhões de cana":

| # | Arquivo:linha | Trecho | Tipo |
|---|---|---|---|
| 1 | `map.js:228-230` | `TALHOES_URL = ".../pol_talhoes.geojson"` | fonte de dados fixa |
| 2 | `map.js:232-234` | `TALHOES_ATRIBUICAO` "Talhões: meus_layers" | atribuição fixa |
| 3 | `map.js:236-286` | `TALHOES_ESTILO*` ("amarelo agrícola") | simbologia fixa, sem estilo por atributo |
| 4 | `map.js:288-293` | `talhoesInput` = `#layer-talhoes`, `talhoesCamada`, `talhaoAtivo`, `talhoesVisivel` | camada singleton |
| 5 | `map.js:339-343` | "Talhões ainda não carregados", "Ative a camada Talhões…", "Centralizar talhões" | textos |
| 6 | `map.js:942`, `:970`, `:981` | "Carregando talhões…", "Talhões indisponíveis", "Talhões inválidos" | textos |
| 7 | `map.js:1466`, `:1471`, `:1493` | "Camada de talhões ainda não carregou", "Nenhum talhão encontrado" | textos |
| 8 | `map.js:888` | `className: "talhao-popup"` | classe CSS de domínio |
| 9 | `css/style.css:901-926` | `.talhao-popup …` | CSS de domínio |
| 10 | `map.js:1279-1287`, `:1369-1377` | IDs `stats-area`, `stats-variedade`, `analytics-area`, `analytics-variedade`, `analytics-fazendas` | IDs com nome agrícola reaproveitados para outro significado ("campos numéricos", "atributos") |
| 11 | `index.html:101-125` | botões **"Por Variedade"** e **"Por Fazenda"** (`#menu-item-tema-variedade`, `#menu-item-tema-fazenda`) | **UI morta:** nenhum JS referencia esses IDs (`grep` vazio). O README afirma que eles ligam/desligam a camada, o que não é verdade no working tree |
| 12 | `index.html:359-379` | checkbox "Talhões", swatch `style="background:#f4c95d"` | camada fixa no HTML |
| 13 | `index.html:12` | meta description "busca por fazenda, talhão ou proprietário" | texto |
| 14 | `index.html:685` | `aria-label="Dashboard de análises dos talhões"` | texto |
| 15 | `map.js:1241-1409` | comentários e nomes `_talhoesSelecionados`, "MÓDULO DE FILTROS DE TALHÕES" (`:1595`) | nomenclatura |
| 16 | `README.md` | documenta `area`, `fazenda,talhão`, "Mato Grosso" e 4,4 MB | documentação desatualizada (ver 7.3) |

### 4.4 Hardcoded por categoria do critério de auditoria

| Critério | Encontrado? | Evidência |
|---|---|---|
| 1. Hardcoded Fields | **Não** no working tree; **sim** no HEAD | 4.1 e 4.2 |
| 2. Hardcoded UI | **Sim** | 4.3, itens 4, 5-7, 11, 12 |
| 3. Hardcoded Filters | **Não** (campos); operadores fixos por tipo | `map.js:1655-1659` |
| 4. Hardcoded Dashboard | **Parcial**: os indicadores são fixos (contagem por tipo), não de domínio | `map.js:1292-1299`; IDs agrícolas em `index.html:702-715` |
| 5. Hardcoded Popups | **Não** (working tree) | `map.js:856-891` |
| 6. Domínio agrícola | **Sim**, em nomes, textos, estilo e menu | 4.3 |
| 7. Código duplicado | **Sim** | 6.6 |
| 8. Acoplamento excessivo | **Sim** | 2.3 |
| 9. Segurança | **Sim** | seção 8 |
| 10. Performance | **Sim** | seção 9 |

---

## 5. Avaliação de Generalização

| Componente | Nota | Justificativa (com evidência) |
|---|---|---|
| **Popups** | **8/10** | Construído com `Object.entries(properties)` e `textContent` (`map.js:856-891`). Sobrevive a qualquer mudança de schema, e já sobreviveu à mudança real do dado. Perde pontos porque: mostra o nome bruto da chave (sem rótulo nem ordem configurável); `formatarValor` (`:712`) aplica `toLocaleString("pt-BR")` a todo número, então um código como `1032` vira `1.032`, regressão que o HEAD evitava de propósito com `decimais`; e os valores numéricos ficam limitados a 3 casas decimais. |
| **Filtros** | **6/10** | Campos vêm do schema (`:1611-1616`) e os operadores dependem do tipo (`:1655-1659`); a sincronização com mapa, estatísticas, tabela e CSV passa por `aplicarFiltros` (`:1727`). Problemas: o tipo `date` cai nos operadores de texto (a data é comparada como string); em `camadaPassaFiltros` (`:736`), `Number(null)` e `Number("")` valem `0`, então valores nulos passam em `< x`; `between` aceita `valueTo` vazio (`Number("")` = 0); o chip mostra a chave interna do operador (`gt`, `lte`) em vez do símbolo (`:1676`); sem lista de valores categóricos (o schema calcula `values`, mas nada usa); os filtros não persistem por camada. |
| **Dashboard** | **3/10** | Os "indicadores" são **metadados do schema**, não análises do dado: nº de feições, nº de campos numéricos, nº de campos categóricos, nº de atributos (`:1292-1299`). O resumo numérico (`:1303-1319`) soma **todo** campo numérico, inclusive identificadores (`Talhão` é `int` no dado atual, e "soma de Talhão" não tem significado). Não há agregação por categoria nem gráficos. O botão "Limpar estatísticas" (`#btn-limpar-estatisticas`) **não tem handler** (só é mostrado/escondido em `:1363`/`:1389`). `estatisticas.alternarSelecao`/`limparSelecao` (`:1396-1408`) são código morto. |
| **Tabela** | **6/10** | Cabeçalhos e células vêm do schema (`:1326-1351`); novos atributos aparecem sozinhos. Mas mostra só as 50 primeiras linhas (`:1341`), sem paginação, ordenação, clique-para-localizar ou destaque de seleção, e reconstrói o DOM inteiro a cada cálculo. `#analytics-empty` não volta a aparecer quando o filtro zera o resultado (só `limparUI` o reexibe, `:1392`). |
| **Busca** | **5/10** | Indexa todos os atributos do schema (`:1133-1141`), sem campos fixos. Porém: (a) a "segunda passada tolerante" **não faz nada diferente**: `compacto: texto.split("").join("")` (`:1146`) e `limpo.split("").join("")` (`:1194`) devolvem o texto original, com os espaços (a intenção documentada era remover espaços; o correto seria `split(" ")`); (b) números são indexados e `normalizar` remove o ponto, então `122.53` vira `12253` e buscas numéricas casam com valores monetários; (c) a busca **ignora os filtros ativos**: `encontrar` percorre todo `indiceBusca`, então a contagem e o `fitBounds` (`:1500`) incluem feições ocultas; (d) não há busca por campo específico (a busca `fazenda,talhão` do HEAD sumiu e o README ainda a documenta); (e) o índice é construído uma única vez e de uma camada só. |
| **Estado** | **3/10** | `applicationState` (`:295-303`) existe e é exposto em `window.State`/`window.WebGIS.state`, mas **não é fonte única de verdade**: `talhoesCamada`, `talhaoAtivo`, `talhoesVisivel`, `selecaoPorBusca`, `talhoesAchados`, `mapaBaseAtual`, `indiceBusca`, `dashboardOpen`, `panelOpen` vivem fora dele. `selectedFeature` e `basemap` **nunca são atualizados** (`basemap` fica em `"satelite"` para sempre; o valor real está em `mapaBaseAtual`, `:181`). O estado de "filtrado" é marcado na própria camada Leaflet (`camada.options._webgisFilterVisible`, `:797`). Não há assinatura nem eventos: cada mutação precisa lembrar de chamar `repintar` e/ou `estatisticas.calcular` manualmente, e as omissões (busca → dashboard) já aparecem. |
| **Camadas/Mapa** | **3/10** | Uma única camada, com URL, estilo, checkbox e atribuição fixos. Não há Layer Manager nem registro de camadas. **Geometrias do tipo ponto quebram a aplicação:** `L.geoJSON` sem `pointToLayer` cria `L.Marker`, que não tem `setStyle` (chamado em `repintar`, `:796/806/812/814`), `bringToFront` (`:886`) nem `getBounds` (`enquadrarResultado`, `:1420`), o que gera um `TypeError` já no primeiro `aplicarFiltros` após a carga. Não há validação de CRS (só funciona com WGS84/CRS84). O botão Home enquadra também as feições filtradas/ocultas (`:500`). Pontos positivos: renderer Canvas, um handler de clique por grupo (`:1000`) e degradação graciosa sem Leaflet (`:61-76`). |
| **Escalabilidade** | **3/10** | Ver seção 9. |

---

## 6. Gargalos Arquiteturais

1. **Monólito `map.js`:** 1.865 linhas num único closure, com 14 responsabilidades. Nada é testável isoladamente nem reaproveitável por uma segunda camada.
2. **Camada singleton:** toda a lógica assume *uma* `talhoesCamada`. Generalizar para N camadas exige mudar todas as funções da seção 2.2.
3. **Sem barramento de estado/eventos:** a sincronização é feita com chamadas imperativas espalhadas. Já há dessincronização entre busca e dashboard (seção 3).
4. **Busca × filtro × dashboard com semânticas diferentes:**
   - `obterCamadasConsideradas` (`:756`): filtro **e** busca.
   - `encontrar` (`:1163`): só busca, ignora o filtro.
   - CSV "filtrado" (`:1839`): usa `filteredFeatures`, que inclui a restrição da busca, e só é atualizado quando `calcular` roda. Pode exportar um resultado desatualizado depois de uma busca.
5. **Acoplamento ao Leaflet no modelo:** o estado do filtro fica dentro de `layer.options`; a seleção é um objeto `L.Path`; o índice de busca guarda referências às camadas Leaflet. Migrar para MapLibre exigirá reescrever o modelo, não só a renderização.
6. **Código duplicado:**
   - `_atualizarUI` e `limparUI` repetem os mesmos 11 `getElementById` (`:1278-1290` e `:1368-1380`).
   - O fechamento do dashboard está escrito três vezes (`:1787-1791`, `:1798-1801`, `:1807-1811`).
   - Os 5 objetos `TALHOES_ESTILO*` repetem `lineCap`/`lineJoin`.
   - `window.State`/`window.WebGIS` são atribuídos duas vezes (`:707-708` e `:1584-1585`).
7. **Código morto:** `alternarVisibilidade` (`:927`), `estatisticas.alternarSelecao`/`limparSelecao` e `_talhoesSelecionados` (`:1242`, `:1396-1408`), `schema.attributes[].values` (calculado em `:690`, nunca lido), `numericTotals` (só gravado em `statistics`).
8. **CSS e HTML com estilo inline:** o botão de filtros (`index.html:398`) e o de limpar estatísticas (`:177`) têm estilos inline, fora dos tokens. `inicializarFiltros` usa `style.display` em vez do atributo `hidden` (`:1745`), contrariando o padrão do resto do código. Também troca o `textContent` do botão (`:1746`), o que destrói o `<strong>` e o `<span class="filter-toggle-arrow">` originais.

---

## 7. Riscos Técnicos

### 7.1 Dado remoto mutável (risco alto, já materializado)
`TALHOES_URL` aponta para a branch `main` de um repositório de terceiro (`Lcs-993/meus_layers`). Entre a escrita do README e hoje, o arquivo mudou de 4,4 MB/3.292 feições para 15,7 MB/3.343 feições e **trocou todo o schema**. Não há versionamento (tag/commit), checksum, cache nem fallback local. A pasta `geojson/` existe, mas só contém o README (`geojson/README.md`, "Estado atual").

### 7.2 Divergência entre HEAD e working tree
Há cerca de 2.400 linhas de mudanças não commitadas, e arquivos removidos (`js/clima.js`, `js/queimadas.js`, `js/csv.js`, CSVs, `Database1.accdb`) ainda não foram commitados. Qualquer push hoje publica uma mudança grande sem testes automatizados (o README afirma "Não há etapa de instalação, build ou testes automatizados").

### 7.3 Documentação desatualizada ou incorreta
- O `README.md` descreve `area`, a busca `fazenda,talhão`, "Os campos indexados são `talhao`, `desc. fazenda`…", o menu "Por Variedade/Por Fazenda" ligando a camada e 4,4 MB. **Nada disso vale mais.**
- O README diz que a extensão `-46.28, -20.35` a `-45.64, -19.90` fica em "Mato Grosso". Essas coordenadas ficam no centro-oeste de **Minas Gerais**.
- O README diz "ainda não há medição, edição nem exportação", mas a exportação CSV existe (`map.js:1816`).

### 7.4 Inferência de tipos frágil (`inferirTipo`, `map.js:641`)
- Número só é reconhecido se `typeof === "number"`. GeoJSON exportado com números como string (comum em shapefile → GeoJSON) vira `string`: os filtros numéricos e o resumo desaparecem.
- Campo 100% nulo (ex.: `Vencimento do Contrato (Ano)` no dado atual) vira `string` e polui tabela, filtro e CSV.
- Identificadores inteiros (`Talhão`) são tratados como métrica.
- Não há distinção entre categórico e texto livre nem cardinalidade: `values` é calculado, mas não é usado.

### 7.5 Geometrias não-poligonais
Ver a nota de Camadas (seção 5): pontos derrubam `repintar`. Também não há tratamento de `GeometryCollection` nem de feições com `geometry: null` no `fitBounds`.

### 7.6 Conflitos de eventos globais (bugs prováveis)
- **Remover um filtro fecha o painel.** O botão "×" é destruído por `renderActive` (`:1683`) antes de o evento chegar ao `document`, então `filterPanel.contains(e.target)` (`:1750`) é falso e o painel fecha.
- `Escape` fecha o dashboard (`:1805`) e também é tratado pela navegação (`navigation.js:326`), o que pode fechar a sidebar no mesmo toque.
- `analyticsClose.addEventListener` (`:1787`) não verifica se o elemento existe, ao contrário de todo o resto do arquivo.

---

## 8. Problemas de Segurança

| # | Problema | Evidência | Severidade |
|---|---|---|---|
| S1 | **Leaflet via CDN sem Subresource Integrity** (`integrity`/`crossorigin`) | `index.html:28-31`, `:764` | Média: comprometimento do unpkg = execução de código arbitrário |
| S2 | **Dado de terceiro sem verificação**, carregado da branch `main` | `map.js:228-230`, `:951` | Média: integridade e disponibilidade (já mudou de forma silenciosa) |
| S3 | **Injeção de fórmula em CSV:** valores iniciados por `=`, `+`, `-`, `@` vão crus para o arquivo aberto no Excel | `exportarCsv`, `map.js:1818` | Média |
| S4 | **Arquivo `Database1.accdb` (348 KB) no commit `fc810f4`** e workflow que publica `path: .` | `git show --stat HEAD`, `pages.yml:34-36` | Média/alta, conforme o conteúdo. A remoção no working tree **não** apaga o arquivo do histórico do Git |
| S5 | Publicação indiscriminada da raiz: `assets/_originais/` (~4 MB de originais), relatórios internos e README vão para o Pages | `pages.yml:36` | Baixa |
| S6 | Sem Content-Security-Policy | `index.html` (ausência de meta CSP) | Baixa |
| S7 | Estado global mutável em `window.State`/`window.WebGIS.state` | `map.js:707`, `:1584` | Baixa (qualquer script na página altera filtros e features) |

**Pontos positivos verificados:** todo conteúdo vindo do GeoJSON é inserido com `textContent` (popup `:874-877`, tabela `:1345`, chips `:1676`, resumo `:1313`). Os únicos `innerHTML` (`:1324`, `:1391`) recebem `''`. A atribuição HTML do Leaflet é uma constante (`:232`). Não foi encontrado vetor de XSS a partir dos dados.

---

## 9. Problemas de Performance

**Volume medido (06/11/2026):** 15.682.621 bytes, 3.343 `MultiPolygon`, **352.104 vértices** (média de 105, máximo de 506 por feição), coordenadas com 15-17 casas decimais, 7 atributos.

| # | Gargalo | Evidência | Impacto |
|---|---|---|---|
| P1 | Download único de 15,7 MB sem compressão própria, sem cache controlado e com precisão excessiva (15+ casas decimais, enquanto 6 casas ≈ 0,1 m bastam) | `map.js:951-957`; dado | Tempo até a primeira feição, consumo de dados no celular |
| P2 | `JSON.parse` de 15,7 MB na thread principal + `L.geoJSON` síncrono | `:957`, `:986` | Trava a UI durante a carga |
| P3 | `repintar` é O(N) e roda **duas vezes por clique** em feição | `mostrarPopup`: `limparSelecao()` (`:883`, que chama `repintar`) e depois `repintar()` (`:885`) | Cada clique avalia todos os filtros e chama `setStyle` 2 × 3.343 vezes |
| P4 | Feições filtradas continuam na camada, só com opacidade 0 | `TALHOES_ESTILO_OCULTO`, `:796` | O Canvas continua iterando e projetando os 352 mil vértices em cada pan/zoom |
| P5 | `descobrirSchema` é O(A × N) e ordena valores únicos de todos os atributos (resultado não usado) | `:685-703` | Desperdício que cresce com campos de alta cardinalidade |
| P6 | `estatisticas.calcular` reconstrói tabela e cabeçalho inteiros e percorre as camadas uma vez por atributo numérico | `:1257-1262`, `:1303-1319`, `:1323-1351` | O(A × N) a cada filtro |
| P7 | `Math.min(...values)` / `Math.max(...values)` | `:1316-1317` | Estoura a pilha com arrays grandes (por volta de 100 mil itens, conforme o motor) |
| P8 | Sem simplificação por zoom, sem tiles vetoriais, sem LOD | — | Limite prático do Leaflet + Canvas com GeoJSON bruto: dezenas de milhares de polígonos ou alguns milhões de vértices |
| P9 | `move` (e não `moveend`) atualiza o rodapé a cada frame de arraste | `:190` | Baixo, mas é custo contínuo |

Pontos positivos: renderer Canvas (`:987`), um único listener de clique por grupo (`:1000`), debounce de 160 ms na busca (`:1514`) e índice de busca pré-calculado.

---

## 10. Roadmap Recomendado

### P0: crítico

| # | Ação | Motivo |
|---|---|---|
| P0.1 | **Fixar a fonte de dados:** copiar o GeoJSON validado para `geojson/` ou apontar para um commit/tag específico em vez de `main` | 7.1: o schema já mudou sem aviso |
| P0.2 | **Commitar ou descartar o working tree** e garantir que o publicado = o revisado; configurar o remote | 7.2 |
| P0.3 | **Tratar geometrias de ponto** (`pointToLayer` → `L.circleMarker`) ou bloquear explicitamente tipos não suportados | 7.5: crash com pontos |
| P0.4 | **Verificar o conteúdo de `Database1.accdb`** e, se for sensível, removê-lo do histórico | S4 |
| P0.5 | **Adicionar SRI** ao Leaflet e **neutralizar fórmulas** no CSV | S1, S3 |
| P0.6 | Corrigir o README (schema, busca, menu, região, exportação) | 7.3: a documentação está induzindo a erro |

### P1: importante

| # | Ação |
|---|---|
| P1.1 | Criar um **store único** (estado + `subscribe`) que concentre camadas, seleção, busca, filtros e basemap; eliminar as variáveis soltas e `_webgisFilterVisible` |
| P1.2 | Unificar a **semântica busca × filtro**: a busca respeita os filtros; dashboard, tabela e CSV reagem à busca |
| P1.3 | Corrigir os bugs da busca (`split("")` → remover espaços), não indexar campos numéricos por padrão, oferecer busca por campo |
| P1.4 | Melhorar `inferirTipo`: números em string, campos 100% nulos, cardinalidade (categórico × texto livre × identificador), datas comparáveis |
| P1.5 | Corrigir filtros: nulos ≠ 0, validação de `between`, rótulo dos operadores, `select` de valores para campos categóricos, painel que não fecha ao remover um filtro |
| P1.6 | Dashboard útil e genérico: contagem por valor dos campos categóricos (top-N), estatísticas só para campos métricos, remover o botão sem ação |
| P1.7 | Remover rótulos de domínio do HTML/JS (itens 4.3) e o menu "Por Variedade/Por Fazenda" sem função |
| P1.8 | Dividir `map.js` em módulos ES (`<script type="module">` funciona no GitHub Pages sem build) |
| P1.9 | Remover elementos ocultos da camada (ou usar `filter` na reconstrução) em vez de opacidade 0; evitar o `repintar` duplo |

### P2: evolução

| # | Ação |
|---|---|
| P2.1 | **Layer Manager** com N camadas (`Layer = { id, name, visible, source, schema, features, filters, style }`) e catálogo em JSON (`layers.json`) |
| P2.2 | Configuração opcional por camada: rótulos, ordem, formatação e campos ocultos, **sem** tornar nenhum campo obrigatório |
| P2.3 | Simbologia por atributo (categórica/graduada) gerada pelo schema |
| P2.4 | Pré-processamento do dado: reduzir a precisão, simplificar, gzip/brotli (o Pages já serve compactado), TopoJSON/FlatGeobuf |
| P2.5 | Parse em Web Worker; tabela virtualizada com ordenação e paginação |
| P2.6 | Abstração de renderer (adaptador Leaflet ↔ MapLibre) e caminho para Vector Tiles/PMTiles |
| P2.7 | Testes automatizados mínimos (schema, filtros, busca) e um GeoJSON de pontos e um de linhas como fixtures |
| P2.8 | Publicar só o necessário (artefato montado com uma lista de arquivos em vez de `path: .`) e adicionar CSP |

---

## 11. Preparação para Arquitetura Orientada a Schema

### 11.1 O que já está pronto

| Requisito da arquitetura alvo | Estado atual | Evidência |
|---|---|---|
| `schema.attributes[{name,type}]` descoberto em runtime | **Existe** | `descobrirSchema`, `map.js:676-709` |
| Popup dinâmico | **Existe** | `map.js:856-891` |
| Tabela com colunas dinâmicas | **Existe** | `map.js:1326-1351` |
| Filtros a partir do schema | **Existe** (com bugs) | `map.js:1598-1725` |
| Exportação CSV de todos os atributos | **Existe** | `map.js:1816-1853` |
| Busca sobre todos os atributos | **Existe** (com bugs) | `map.js:1126-1211` |
| Estado global | **Parcial** | `applicationState`, `map.js:295` |

### 11.2 Lacunas em relação a `Layer = { id, name, visible, geojson, schema, features, filters }`

| Campo alvo | Hoje | O que precisa mudar |
|---|---|---|
| `id` | inexistente | Gerar a partir de um catálogo; usar como chave no estado e no DOM (o checkbox `#layer-talhoes` precisa virar um item gerado) |
| `name` | texto "Talhões" espalhado em HTML/JS | Vir do catálogo ou de `geojson.name` (o dado já traz `"name": "pol_talhoes"`) |
| `visible` | `talhoesVisivel` (variável solta, `:293`) | Mover para `layer.visible` no store |
| `geojson` | `dados` local de `carregarTalhoes` | Guardar a origem (URL/arquivo) e os metadados (CRS, `name`) |
| `schema` | `applicationState.schema`, **global** | Passar a ser por camada; a UI escolhe a camada ativa |
| `features` | `applicationState.allFeatures`, global | Por camada; com IDs estáveis (o dado atual **não tem `id`** em nenhuma feição, então gerar um ao carregar) |
| `filters` | `applicationState.filters`, global | Por camada |

### 11.3 Mudanças necessárias por componente

1. **Carga:** `carregarTalhoes` → `loadLayer(def)` genérico. Ele valida `FeatureCollection`, o CRS (aceitar CRS84/EPSG:4326 e rejeitar ou avisar nos demais) e os tipos de geometria, e gera os IDs.
2. **Schema:** `inferirTipo` com mais papéis (`identifier`, `category`, `text`, `measure`, `date`, `boolean`, `empty`) e com cardinalidade. São esses papéis que deixam o dashboard e a busca decidirem *sozinhos* o que somar, agrupar ou indexar, sem nome de campo.
3. **Estado:** store único com `layers`, `activeLayerId`, `selection {layerId, featureId}`, `search {term, results}`, `basemap`, e notificação por evento. `repintar`, a tabela, o dashboard e o CSV passam a *reagir* ao store em vez de serem chamados à mão.
4. **Renderização:** isolar tudo que é Leaflet (`L.geoJSON`, `setStyle`, `bindPopup`, `fitBounds`, `eachLayer`) num adaptador. O modelo guarda `featureId`, não referências `L.Path`. Isso é pré-requisito para MapLibre e Vector Tiles.
5. **Estilo:** `TALHOES_ESTILO*` → estilo por camada (padrão + estados de seleção/busca) com suporte a ponto, linha e polígono.
6. **Popup:** manter o modelo dinâmico; acrescentar formatação por papel (identificador sem separador de milhar, medida com casas decimais configuráveis) e um mapa opcional de rótulos.
7. **Filtros:** operadores por papel (datas com intervalo, categorias com `select`/multiselect usando `values`), nulos tratados de forma explícita, filtros por camada.
8. **Dashboard:** gerado a partir dos papéis: contagem total, top-N por campo categórico, soma/média/min/max só para `measure`. Remover os IDs agrícolas do HTML e gerar os cartões.
9. **Busca:** por camada (ou global com prefixo de camada), respeitando os filtros, com opção de campo e sem indexar `measure`.
10. **HTML:** a sidebar, os temas e os cartões do dashboard passam a ser gerados a partir do catálogo de camadas. Os rótulos fixos de domínio saem do `index.html`.

### 11.4 Veredito

O working tree já deu o passo mais importante, tirar os nomes de campo do código, e **resistiu na prática** a uma troca completa de schema do dado de origem. O que separa a aplicação de uma plataforma genérica deixou de ser os *atributos* e passou a ser a **camada única**, o **estado fragmentado**, a **ausência de papéis semânticos no schema** e o **suporte só a polígonos**. Esses são os quatro eixos a atacar, nessa ordem, depois dos itens P0.
