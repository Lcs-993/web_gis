# RELATÓRIO DE ENTENDIMENTO DO PROJETO

**Data da análise:** 06/11/2026  
**Escopo:** aplicação publicada na raiz do repositório.  
**Conclusão de escopo:** a pasta `web_gis-main/` é uma referência de migração
antiga, explicitamente excluída da aplicação publicada pelo [README.md](./README.md)
e pelo [.gitignore](./.gitignore). Ela foi analisada para identificar decisões
anteriores e divergências, mas não representa o fluxo executado pela raiz.

## 1. Visão Geral do Projeto

### Objetivo principal

O projeto é uma aplicação WebGIS estática para visualizar e consultar talhões
agrícolas sobre mapas-base de satélite ou ruas. A execução é feita no navegador,
sem build, backend obrigatório ou dependências de npm.

### Público-alvo

O público observado é formado por usuários que precisam consultar talhões,
fazendas, proprietários, variedades e áreas agrícolas em uma interface visual.
O [README.md](./README.md) caracteriza o sistema como módulo de visualização do
Portal Agrícola.

### Casos de uso principais

- visualizar mapa-base Esri em satélite ou ruas;
- carregar e renderizar o GeoJSON remoto de talhões;
- ligar/desligar a camada vetorial;
- pesquisar fazenda, talhão, proprietário ou variedade;
- clicar em uma feição e consultar atributos em popup;
- visualizar indicadores e tabela no dashboard;
- aplicar filtros por atributos e intervalo de área;
- alternar tema claro/escuro;
- usar zoom, enquadramento, tela cheia e menu lateral;
- publicar os arquivos estáticos via GitHub Pages.

## 2. Arquitetura Identificada

### Estrutura de pastas

```text
/
├── index.html                 página publicada e marcação da interface
├── css/style.css              layout, temas, controles e dashboard
├── js/map.js                  Leaflet, GeoJSON, busca, filtros e análises
├── js/navigation.js           menus, sidebar e teclado
├── js/theme.js                persistência e alternância de tema
├── assets/                   favicons e imagens
├── .github/workflows/pages.yml publicação no GitHub Pages
├── .nojekyll
└── web_gis-main/             referência documental/código não publicada
```

### Componentes existentes

1. **Página e apresentação:** `index.html` define topbar, sidebar, mapa,
   pesquisa, filtros, controles e dashboard.
2. **Tema:** `js/theme.js` aplica `data-theme`, usa `localStorage` e acompanha
   `prefers-color-scheme`.
3. **Navegação:** `js/navigation.js` controla dropdowns, sidebar, foco,
   `Escape` e atributos ARIA.
4. **Core geográfico atual:** `js/map.js` cria o mapa Leaflet, mapas-base,
   camada GeoJSON, busca, seleção, indicadores, filtros e dashboard.
5. **Estilos:** `css/style.css` concentra tokens, responsividade, glassmorphism,
   estados e componentes.

### Fluxo de dados atual

```text
index.html
→ Leaflet 1.9.4 via CDN
→ js/map.js inicializa o mapa
→ fetch(TALHOES_URL)
→ response.json()
→ valida FeatureCollection
→ L.geoJSON com renderer Canvas
→ camada mantida em talhoesCamada
→ índice de busca e leitura dos atributos
→ popup, realces, estatísticas e dashboard
```

O estado runtime está concentrado em variáveis locais de `js/map.js`, com a
referência pública `window.WebGIS = { map }`. Não há store, barramento de
eventos ou Layer Manager na aplicação publicada.

### Camadas da aplicação

- **Infraestrutura externa:** CDN Leaflet, tiles Esri e GeoJSON hospedado no
  GitHub.
- **Mapa:** instância Leaflet em EPSG:3857.
- **Dados:** GeoJSON em CRS84/WGS84, projetado pelo Leaflet para exibição.
- **Interação:** busca, clique, popup, seleção e controles.
- **Análise:** cálculo de total, área, variedades, fazendas e tabela.
- **Apresentação:** HTML/CSS, tema, menus e acessibilidade.

## 3. Stack Tecnológica

| Categoria | Tecnologia observada | Uso |
|---|---|---|
| Linguagem | HTML, CSS, JavaScript vanilla | aplicação inteira |
| Framework | nenhum | não há framework frontend |
| Build | nenhum | arquivos são servidos diretamente |
| Mapa GIS | Leaflet 1.9.4 | mapa, tiles, GeoJSON, bounds e eventos |
| Renderização vetorial | `L.canvas()` | reduz custo de milhares de feições |
| Mapas-base | Esri World Imagery e World Street Map | satélite e ruas |
| Dados | GeoJSON remoto | fonte dos talhões |
| Visualização analítica | HTML/CSS/JavaScript | cards, indicadores e tabela |
| Publicação | GitHub Actions + GitHub Pages | workflow em `.github/workflows/pages.yml` |
| Persistência local | `localStorage` | preferência de tema |

Não foram encontrados `package.json`, bundler, TypeScript, biblioteca de
gráficos, biblioteca de filtros ou dependência GIS além do Leaflet.

## 4. Módulos Existentes

| Módulo | Finalidade e responsabilidades | Dependências | Estado |
|---|---|---|---|
| `index.html` | Estrutura da UI, controles e pontos de integração | Leaflet CDN e IDs/classes consumidos por JS | Implementado |
| `js/map.js` | Inicialização Leaflet, basemaps, aquisição/parsing GeoJSON, seleção, busca, filtros, estatísticas e dashboard | Leaflet, DOM de `index.html`, rede | Funcional, mas muito acoplado |
| `js/navigation.js` | Dropdowns, menu lateral, foco e teclado | DOM e CSS | Implementado |
| `js/theme.js` | Alternância, persistência e sincronização do tema | DOM e `localStorage` | Implementado |
| `css/style.css` | Identidade visual, layout, responsividade e estados | HTML e classes JavaScript | Implementado |
| `pages.yml` | Publicação automática da raiz | GitHub Actions e GitHub Pages | Configurado |

### Estado da referência `web_gis-main`

A referência contém uma arquitetura mais modular, com `config/application.js`,
`layer-manager.js`, provider GeoJSON, popup, busca, medição e desenho. Porém,
`WebGIS.html` e esses scripts não são referenciados por `index.html`, e o
README raiz declara que essa pasta não faz parte da aplicação publicada.
Portanto, essas capacidades não devem ser consideradas disponíveis no MVP
atual sem uma migração explícita.

## 5. Fluxo de Dados Detalhado

### GeoJSON → parser → armazenamento

1. `js/map.js` define `TALHOES_URL` apontando para
   `https://raw.githubusercontent.com/Lcs-993/meus_layers/main/pol_talhoes.geojson`.
2. O `fetch` é feito depois da primeira inicialização do mapa.
3. A resposta é convertida com `response.json()`.
4. O código verifica `type === "FeatureCollection"` e `features` como array.
5. `L.geoJSON` cria a camada usando `L.canvas()` e o estilo agrícola.
6. A camada fica em `talhoesCamada`; os atributos permanecem nas propriedades
   das features Leaflet.
7. `construirIndiceBusca()` cria um índice textual em memória.

Não existe armazenamento local permanente, banco, normalização de atributos ou
cache próprio do GeoJSON.

### Armazenamento → mapa

`talhoesCamada.addTo(map)` adiciona a camada ao Leaflet. O mapa começa no Brasil
com zoom 4 e pode usar zoom 4–18. Quando a camada carrega, o mapa é enquadrado
nos bounds dos talhões.

### Mapa → dashboard

O dashboard percorre `map.eachLayer`, identifica objetos com
`layer.feature.properties`, soma `area`, conta variedades e monta até 50 linhas
na tabela. A atualização ocorre em chamadas diretas dentro de `js/map.js`; não
há um modelo de estado compartilhado entre mapa e dashboard.

### Filtros → componentes

Após o carregamento, `js/map.js` descobre o schema das propriedades e gera um
seletor de campo, operador e valor. Os operadores são escolhidos conforme o
tipo (`string`, `number`, `boolean` ou `date`). Uma decisão única de filtragem
controla o estilo/interatividade das feições, os indicadores e as linhas da
tabela. Feições fora do filtro ficam visualmente transparentes e não
interativas, sem duplicar ou reconstruir a camada Leaflet.

### Busca e seleção

A busca usa debounce de 160 ms, normaliza acentos/caixa/pontuação, aceita código
de fazenda e pares fazenda-talhão, pinta resultados e enquadra os bounds. O
clique abre popup com `textContent`, evitando interpretar atributos como HTML.

## 6. Avaliação Técnica

### Pontos fortes

- arquitetura simples e adequada a uma primeira entrega estática;
- execução client-side e publicação direta no GitHub Pages;
- uso de Canvas para milhares de polígonos;
- separação básica entre tema, navegação e mapa;
- feedback de indisponibilidade do Leaflet/GeoJSON;
- busca com normalização, debounce e índice em memória;
- uso de `textContent` nos popups;
- suporte a teclado, ARIA, `inert` e `prefers-reduced-motion`;
- mapa-base e camada vetorial podem ser alternados;
- documentação raiz descreve execução, limitações e dependências de rede.

### Riscos técnicos

- GeoJSON remoto de aproximadamente 4,4 MB e cerca de 3.292 feições é
  carregado integralmente; isso pressiona rede, memória e dispositivos móveis.
- tiles e dados dependem de terceiros e de conexão.
- `js/map.js` concentra responsabilidades de domínio, estado, aquisição,
  UI e análise, dificultando testes e evolução.
- `window.WebGIS` expõe somente o mapa e não oferece contrato de estado.
- dashboard, busca e filtros percorrem diretamente camadas internas do Leaflet.
- a tabela usa `innerHTML` com valores de atributos, ao contrário do popup;
  isso deve ser corrigido antes de tratar dados como não confiáveis.
- fontes Esri exigem revisão de termos/licenciamento para produção.

### Débito técnico

- ausência de testes automatizados e de validação de regressão visual;
- filtros sem estado único nem aplicação visual completa;
- estatísticas duplicadas entre dropdown e dashboard;
- HTML com estilos inline nos filtros;
- nomes e responsabilidades de `map.js` excessivamente amplos;
- nenhum carregamento espacial, paginação, simplificação ou vector tiles;
- nenhum mecanismo de exportação efetivamente implementado, embora a UI o
  apresente.

### Melhorias recomendadas

1. definir um estado único de features filtradas e derivar mapa, indicadores e
   tabela desse estado;
2. separar aquisição/parsing GeoJSON, camada Leaflet, busca, filtros e
   analytics em módulos;
3. substituir a carga integral por BBOX, paginação espacial, GeoJSON
   simplificado ou vector tiles;
4. gerar opções de filtros a partir dos atributos reais;
5. trocar `innerHTML` por criação segura de nós na tabela;
6. adicionar testes de parsing, busca, filtros e cálculos;
7. revisar atribuição/licenciamento e disponibilidade dos serviços externos;
8. só então avaliar a migração modular documentada em `web_gis-main/`.

## 7. Respostas às Perguntas Principais

1. **Como o GeoJSON é carregado?**  
   Por `fetch` em `js/map.js`, diretamente de um arquivo raw do GitHub, após a
   inicialização do mapa.
2. **Como os atributos são armazenados?**  
   Nas propriedades de cada feature dentro da `L.GeoJSON` mantida em
   `talhoesCamada`, além de `window.WebGIS.state.schema.attributes` e de um
   índice textual genérico para busca.
3. **Como mapa e dashboard se comunicam?**  
   Por acesso direto ao mapa Leaflet e a `layer.feature.properties`, sem eventos
   ou store intermediário.
4. **Como filtros afetam componentes?**  
   `js/map.js` mantém os filtros ativos no módulo atual, repinta como
   transparentes as feições que não passam e calcula indicadores/tabela sobre
   as mesmas feições consideradas.
5. **Quais bibliotecas GIS são usadas?**  
   Leaflet 1.9.4; os mapas-base são serviços de tiles Esri.
6. **O projeto está preparado para crescer?**  
   Parcialmente. A UI tem pontos de extensão, mas o código publicado é
   monolítico e específico de talhões. A arquitetura modular existente está
   apenas na referência não publicada.
7. **Quais melhorias arquiteturais são recomendadas?**  
   Estado único de dados filtrados, módulos independentes, contrato de camada,
   provider GeoJSON, carregamento espacial e testes.
8. **Quais funcionalidades faltam para um MVP completo?**  
   Suporte a múltiplas camadas com schema próprio, testes, gráficos analíticos
   dedicados, tratamento de desempenho para dados maiores e validação visual.

## 8. Próximos Passos — Backlog Priorizado

### P0 — Funcionalidades críticas

1. gerar dinamicamente as opções de Fazenda, Variedade e Proprietário a partir
   dos atributos reais;
2. corrigir a renderização da tabela para não inserir atributos via `innerHTML`;
3. adicionar testes mínimos para carga válida/inválida, busca, filtros e
   agregações;
4. definir tratamento explícito para falha, timeout e indisponibilidade dos
   serviços externos;
5. validar publicação real pelo workflow do GitHub Pages.

### P1 — Funcionalidades desejáveis

1. separar `map.js` em módulos de dados, camada, busca, filtros e analytics;
2. popular dinamicamente valores de Fazenda, Variedade e Proprietário;
3. implementar exportação CSV anunciada no dashboard;
4. adicionar carregamento por extensão espacial ou reduzir/simplificar o
   GeoJSON;
5. adicionar paginação ou virtualização da tabela;
6. persistir filtros e mapa-base, se isso for desejado pelo produto.

### P2 — Melhorias futuras

1. migrar para vector tiles ou outro formato otimizado para escala;
2. incorporar medição, desenho e KML da referência modular após validação;
3. suportar múltiplas camadas e providers genéricos;
4. adicionar gráficos dedicados ao dashboard;
5. avaliar TypeScript e um build apenas quando a complexidade justificar;
6. revisar licenciamento, observabilidade e política de cache dos dados.

## 9. Arquivos Analisados

### Aplicação publicada

- [README.md](./README.md)
- [index.html](./index.html)
- [js/map.js](./js/map.js)
- [js/navigation.js](./js/navigation.js)
- [js/theme.js](./js/theme.js)
- [css/style.css](./css/style.css)
- [.github/workflows/pages.yml](./.github/workflows/pages.yml)
- [.gitignore](./.gitignore)
- [.vscode/launch.json](./.vscode/launch.json)
- [.nojekyll](./.nojekyll)

### Referência documental e de migração

- [web_gis-main/README.md](./web_gis-main/README.md)
- [web_gis-main/WEBGIS_AUDIT.md](./web_gis-main/WEBGIS_AUDIT.md)
- [web_gis-main/WEBGIS_LAYER_MANAGER.md](./web_gis-main/WEBGIS_LAYER_MANAGER.md)
- [web_gis-main/WEBGIS_MEASUREMENT.md](./web_gis-main/WEBGIS_MEASUREMENT.md)
- [web_gis-main/WEBGIS_MEASUREMENT_antes dos rótulos.md](./web_gis-main/WEBGIS_MEASUREMENT_antes%20dos%20rótulos.md)
- [web_gis-main/WEBGIS_PROVIDER_CONTRACT.md](./web_gis-main/WEBGIS_PROVIDER_CONTRACT.md)
- [web_gis-main/WEBGIS_SEARCH.md](./web_gis-main/WEBGIS_SEARCH.md)
- [web_gis-main/relatorio-projeto.md](./web_gis-main/relatorio-projeto.md)
- [web_gis-main/.github/copilot-instructions.md](./web_gis-main/.github/copilot-instructions.md)
- [web_gis-main/WebGIS.html](./web_gis-main/WebGIS.html)
- [web_gis-main/js/config/application.js](./web_gis-main/js/config/application.js)
- [web_gis-main/js/map.js](./web_gis-main/js/map.js)
- [web_gis-main/js/geojson.js](./web_gis-main/js/geojson.js)
- [web_gis-main/js/layer-manager.js](./web_gis-main/js/layer-manager.js)
- [web_gis-main/js/interface.js](./web_gis-main/js/interface.js)
- [web_gis-main/js/search.js](./web_gis-main/js/search.js)
- [web_gis-main/js/popup.js](./web_gis-main/js/popup.js)
- [web_gis-main/js/drawing.js](./web_gis-main/js/drawing.js)
- [web_gis-main/js/measurement.js](./web_gis-main/js/measurement.js)

**Resultado:** o entendimento arquitetural foi concluído e documentado antes de
qualquer alteração de desenvolvimento. Nenhum arquivo de código foi modificado
nesta etapa.
