# Revisão de UX — WebGIS

**Data:** 08/11/2026 (atualizada no mesmo dia com o backlog P2)
**Método:** aplicação executada no Chromium (1440 × 900 e 390 × 844, temas claro e escuro), navegação por mouse e teclado, leitura de `index.html`, `css/style.css` e `js/`.
**Prioridade:** P0 = crítico · P1 = importante · P2 = melhoria.
**Status:** ✅ resolvido nesta revisão · ⏳ backlog.

---

## Resumo

A base já é sólida: o mapa é o protagonista, a paleta e os materiais seguem o iOS, os painéis respeitam `inert`/`aria-expanded`/Esc e tudo é orientado ao schema. Os problemas mais sérios estavam no **celular** (funções inacessíveis e Analytics apertado) e no **popup** (lista crua, sem hierarquia nem ações). Os dois foram resolvidos, sem custo de renderização no Leaflet.

| # | Tela | Problema | Prioridade | Status |
|---|---|---|---|---|
| 1 | Barra superior (celular) | Menus de módulos somem: **Adicionar dados** e **Exportar KML** ficam inacessíveis | P0 | ✅ |
| 2 | Popup | Lista crua de atributos, sem título, sem destaque, vazios exibidos como "—", sem ações | P1 | ✅ |
| 3 | Mapa | Clique com o mouse acende o anel de foco azul em volta do mapa inteiro | P1 | ✅ |
| 4 | Analytics (celular) | Cabeçalho em 4 linhas ocupa ~45% do painel; sobram ~6 linhas de tabela | P1 | ✅ |
| 5 | Barra superior (desktop) | 3 dos 4 menus só têm itens "Em breve" (12 de 14) e competem com o mapa | P1 | ⏳ |
| 6 | Tabela | Linha de totais com "—" e chevron em toda coluna: ruído visual | P2 | ✅ |
| 7 | Tabela | Seleção pela tabela não mostra a feição inteira (no celular, só 2 colunas visíveis) | P2 | ✅ |
| 8 | Camadas | Ícones da linha sem rótulo visível (sem tooltip no toque); sem símbolo da camada | P2 | ✅ |
| 9 | Filtros | Condições sempre combinadas por E; sem OU nem filtros salvos | P2 | ✅ |
| 10 | Analytics | Sem KPIs no Resumo (contagem, soma da medida principal) | P2 | ✅ |
| 11 | Botão primário | Texto branco sobre o verde da marca: contraste ~2,4:1 (WCAG AA pede 4,5:1) | P1 | ✅ |
| 12 | Resumo (≤ 900 px) | Cards empilhados se sobrepunham (linhas do grid encolhiam até a altura do painel) | P1 | ✅ |

---

## 1. Barra superior no celular — P0 ✅

**Problema.** Abaixo de 720 px, `.module-menu { display: none }` escondia os quatro menus. O comentário dizia que "a versão para celular vem com os módulos", mas **Adicionar dados** e **Exportar KML** já existem e só estavam nesses menus.

**Impacto UX.** Funções prontas inalcançáveis no celular e no tablet em retrato. Viola "menus ocultando funções".

**Solução aplicada.** Em telas estreitas, um botão único (ícone de quadradinhos) ao lado das ações abre uma **folha de largura total** com todos os menus em seções. Menus com algum módulo pronto vêm primeiro (Ferramentas). Mesmo componente, mesmo teclado (↑/↓, Home/End, Esc); ←/→ pulam o menu oculto. `js/ui/module-menu.js`, `css/style.css` (seção 10).

---

## 2. Popup — P1 ✅

**Problema.** Todos os atributos na ordem do arquivo, nomes em verde caixa-alta, valores vazios como "—", sem título e sem ação. Parecia uma tabela bruta.

**Impacto UX.** O usuário precisa ler a lista inteira para saber *qual* feição clicou; nenhum caminho direto do popup para a tabela ou para aproximar.

**Solução aplicada** (sem nenhum nome de atributo no código):

1. **Cabeçalho**: `Camada · Atributo` e o **título** da feição — 1º atributo do rótulo da camada; sem rótulo, o 1º texto/categoria preenchido.
2. **Destaques**: até 3 medidas (números decimais) em blocos, como os indicadores do Apple Weather.
3. **Detalhes**: demais atributos numa lista agrupada iOS (rótulo discreto, valor em destaque, separadores recuados).
4. **Vazios recolhidos**: "N atributos sem valor" (abre com um clique).
5. **Ações**: **Aproximar** e **Ver na tabela** (troca a camada ativa se preciso e abre o Analytics na linha da feição).

Vidro moderado, cantos de 16 px, botão fechar circular. Ações em `--color-action` (#0066cc no claro, #64b0ff no escuro), com contraste ≥ 4,5:1. `js/ui/popup.js`, `js/main.js`.

---

## 3. Anel de foco no mapa ao clicar — P1 ✅

**Problema.** O Leaflet dá `focus()` no contêiner a cada clique; o Chromium trata esse foco por script como `:focus-visible`. O mapa inteiro ganhava borda azul.

**Impacto UX.** Ruído visual permanente sobre o protagonista da tela.

**Solução aplicada.** Classe `is-pointer-focus` no `pointerdown`, removida no Tab e no blur; o CSS suprime o anel só nesse caso. Quem navega pelo teclado continua vendo o foco (WCAG 2.4.7). `js/map/leaflet-view.js`.

---

## 4. Cabeçalho do Analytics no celular — P1 ✅

**Problema.** Ícone, título, busca, rótulo "CAMADA", seletor, abas e ações quebravam em 4 linhas.

**Impacto UX.** A tabela, razão de abrir o painel, ficava com poucas linhas visíveis.

**Solução aplicada.** Abaixo de 720 px: título + maximizar/fechar na 1ª linha, busca na 2ª, camada + abas na 3ª; ícone e rótulo "CAMADA" saem (o seletor já mostra a camada).

---

## 5. Menus "Em breve" no desktop — P1 ⏳

**Problema.** Monitoramento, Operação e Análises só têm itens "Em breve"; a barra anuncia 14 módulos e entrega 2.

**Impacto UX.** Expectativa frustrada a cada clique; a barra chama atenção que deveria ir para o mapa.

**Solução recomendada.** Uma flag em `MODULE_MENUS` (ex.: `showSoon: false`) para ocultar menus sem módulo pronto em produção, ou agrupar todos os "Em breve" num único item "Próximos módulos". Decisão de produto, por isso não foi aplicada.

---

## 6. Totais da tabela — P2 ✅

**Problema.** Cada coluna sem total mostrava "—" e um chevron.
**Solução aplicada.** Em dispositivos com mouse, o seletor das colunas sem total fica invisível e aparece ao passar sobre o rodapé ou ao receber foco pelo teclado. Em telas de toque (sem hover) continua visível, para não ficar inacessível.

## 7. Feição selecionada pela tabela — P2 ✅

**Problema.** Com o Analytics aberto o popup não abre (decisão correta: cobriria a feição), mas a tabela corta textos e, no celular, mostra só duas colunas.
**Solução aplicada.** Cartão da feição no canto superior esquerdo do mapa, com o mesmo conteúdo do popup e **Aproximar**. × só esconde o cartão (a seleção fica); clicar de novo na feição o reabre. No celular ele começa recolhido (só o título) e expande pela seta, para não cobrir o mapa. Some com o Analytics maximizado. `js/ui/feature-card.js`.

## 8. Camadas — P2 ✅

**Correção da revisão.** A legenda do tema já existia (aparece ao ligar a paleta).
**Solução aplicada.** Símbolo da camada antes do nome, como no sumário do ArcGIS (quadrado preenchido, só contorno, círculo, traço ou o ícone do ponto, na cor da camada). Guia rápido no pé da aba: o que é a camada ativa e o significado de cada ícone, legível também no toque.

## 9. Filtros — P2 ✅

**Correção da revisão.** O painel já aceitava várias condições; faltava escolher como combiná-las.
**Solução aplicada.**
- Com 2+ condições: controle segmentado **todas** (E) / **qualquer uma** (OU), com "e"/"ou" entre as etiquetas. Rádio acessível (setas alternam). O contexto do Analytics também usa "ou".
- **Salvar…** grava o conjunto (condições + modo) com um nome, por camada, no `localStorage`. Um clique reaplica; condições de atributos que não existem mais são ignoradas. Leitura e escrita protegidas: sem `localStorage`, o painel segue funcionando.
- `js/data/filters.js` (`applyFilters(features, filters, mode)`), `js/core/store.js` (`filterMode`, `setFilterMode`, `setFilters`), `js/data/saved-filters.js`.

## 10. KPIs no Resumo — P2 ✅

**Solução aplicada.** Indicadores à direita da barra de agrupamento (sem linha própria, para os cards manterem a altura): feições, soma e média da medida (a do Operador; senão o 1º número decimal, nunca códigos inteiros) e quantos valores tem o agrupamento. Com filtro ou busca, mostram a fração do total da camada. Abaixo de 900 px viram uma grade 2 × 2 dentro da barra.

## 11. Contraste do botão primário — P1 ✅

**Solução aplicada.** Token `--color-brand-strong` (#2e7d32, 5,1:1 com branco) no fundo dos botões primários. A cor da marca segue igual no resto da interface.

## 12. Resumo empilhado — P1 ✅

**Problema.** Abaixo de 900 px os cards do Resumo se sobrepunham: o `min-height: 0` da versão lado a lado fazia as linhas do grid encolherem até a altura do painel.
**Solução aplicada.** No layout empilhado, linhas `max-content` e cards com `min-height: auto`; o painel rola por inteiro.

---

## Pendente: decisão de produto

O item 5 (menus só com "Em breve") continua aberto. Opções: ocultar menus sem módulo pronto, ou reunir todos os "Em breve" num único item "Próximos módulos".

---

## Desempenho

Nenhuma mudança toca o desenho do Leaflet (canvas, estilos, rótulos). O modo OU percorre as feições uma vez, como o E (para no primeiro predicado verdadeiro). Os KPIs fazem até três passadas O(n) sobre o conjunto ao renderizar o Resumo (o próprio agrupamento já é O(n)); com 3.388 feições, irrelevante. O popup é montado só ao abrir, com o mesmo número de nós de antes, mais dois botões. O `backdrop-filter` do popup vale para um único elemento pequeno. A folha de módulos é DOM estático, criado uma vez.
