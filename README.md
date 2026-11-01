# WebGIS

Interface web para consulta e visualização de dados geoespaciais.

Projeto estático: **HTML, CSS e JavaScript puros**, sem build e sem
dependências de npm. O único recurso externo é o Leaflet, carregado por
CDN e com degradação graciosa (ver *Mapa* abaixo).

---

## Como executar

Basta abrir `index.html` no navegador. Para evitar restrições de
`file://` (recomendado, principalmente para testar o mapa):

```bash
python -m http.server 8899
# depois acesse http://127.0.0.1:8899
```

## Publicar no GitHub Pages

O projeto já está preparado para hospedagem estática. Não há etapa de
build nem dependências de npm. O workflow em
`.github/workflows/pages.yml` publica automaticamente a raiz do projeto
sempre que houver push na branch `main`.

### Primeira publicação

Na pasta `web_map`, crie um repositório vazio no GitHub e execute:

```bash
git init
git add .
git commit -m "Publicar WebGIS"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Depois, no GitHub, abra **Settings > Pages**, selecione **GitHub Actions**
como fonte de publicação e aguarde a execução do workflow. O endereço será
exibido na seção **Pages** e terá este formato:

```text
https://SEU_USUARIO.github.io/SEU_REPOSITORIO/
```

O arquivo `.nojekyll` já está incluído para impedir que o GitHub Pages
aplique processamento Jekyll aos arquivos estáticos.

---

## Estrutura

```
web_map/
├── index.html
├── previsao_bambui.csv    previsão do IPMet Radar (gerada pelo notebook)
├── css/
│   └── style.css
├── js/
│   ├── theme.js           alternância claro / escuro
│   ├── navigation.js      navegação principal + menu lateral
│   ├── map.js             mapa base (Leaflet + Esri) + camada de talhões + busca
│   ├── csv.js             leitor de CSV compartilhado pelos dois módulos
│   ├── clima.js           módulo de previsão climática
│   └── queimadas.js       módulo de análise de queimadas
├── dados_queimadas/       amostras locais de focos (backup)
└── assets/
    ├── favicon.ico       16, 32 e 48 px
    ├── favcon_*.png      128 px
    ├── portal_ico.png    256 px
    ├── Analytics*.png    256 px
    ├── Gorila_*.jpg
    └── _originais/       versões originais em alta resolução
```

Os arquivos originais dos módulos ficam em
`~/Documents/modulo_analises_climaticas/`, com o notebook
`imet_previsao_cidades.ipynb` que gera o CSV de previsão. Em
`web_map/` só estão os dados já processados.

Os arquivos em `assets/_originais/` não são usados pela aplicação.
Foram preservados para caso seja necessário reexportar em outra
resolução; podem ser excluídos com segurança.

---

## Mapa

O projeto usa **exclusivamente** o **Esri World Imagery** (imagem de
satélite), via Leaflet 1.9.4 carregado por CDN.

- Serviço: `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery`
- Projeção: Web Mercator (EPSG:3857)
- Zoom: **4 a 18**
- Vista inicial: Brasil (`-14.235, -51.925`), zoom 4

> Com a camada de talhões carregada, a vista muda para a extent dela
> (Mato Grosso, zoom 11). Para voltar ao Brasil, recarregue a página
> com a camada desligada.

O intervalo é aplicado no próprio mapa (`minZoom` / `maxZoom`), então
vale para **todas** as formas de zoom — roda do mouse, duplo clique,
teclado e pinça. Também foi replicado na camada de tiles
(`minZoom` / `maxZoom`), para o Leaflet pedir tiles do tamanho
correto em vez de estimar com base no zoom nativo do serviço.

Ainda não há botões `+` / `−` na tela: o zoom é só por gesto ou
teclado.

### Rodapé

Duas zonas: o **estado do mapa** à esquerda e as **coordenadas do
cursor** à direita.

Sairam daqui o texto de zoom, o ponto de status e a **barra de
escala**. A régua era a única occupant da zona central e o que
justificava a grade `1fr auto 1fr`; sem ela o rodapé virou `flex`
com `space-between`, que chega ao mesmo alinhamento sem as duas
colunas vazias.

Com a régua fora, **a escala não é exibida em lugar nenhum**. Para
trazê-la de volta o caminho é `L.control.scale` no canto inferior
do mapa — sem a injeção em `map._controlCorners.bottomcenter`, que
existia só para apontar para o elemento do rodapé.

O texto de status foi mantido porque é a única superfície que avisa
sobre falha de carga dos talhões (*Talhões indisponíveis*). O
parâmetro `isOnline` de `setFooterStatus` saiu junto com o ponto
que ele coloria; o texto já diz o suficiente.

Não há outros mapas base no projeto — o menu *Mapa* não oferece
alternativas de fundo.

Se o Leaflet não carregar (sem rede, CDN bloqueado), a aplicação
continua funcionando normalmente: o placeholder cinza (`#d9ddd9`)
permanece visível e o rodapé exibe *Mapa indisponível*.

> O Leaflet é carregado por CDN porque a imagem oficial do projeto já
> usava URLs remotas. Para eliminar a dependência de rede, basta
> baixar `leaflet.js` e `leaflet.css` para `assets/` e apontar as tags
> no `index.html` para os caminhos locais.
>
> Os tiles da Esri sempre exigem rede: eles não podem ser servidos
> localmente sem espelhar o serviço.

---

## Camada de talhões

Uma camada vetorial é carregada por cima do satélite. O dado vem
direto do GitHub, sem cópia local:

```
https://raw.githubusercontent.com/Lcs-993/meus_layers/main/pol_talhoes.geojson
```

- **3.292 feições**, todas `MultiPolygon` (talhões de cana)
- **4,4 MB**, CRS84 (WGS84) — compatível com o EPSG:3857 do mapa,
  sem reprojeção
- Extensão: `-46.2765, -20.3527` a `-45.6398, -19.9028` (Mato Grosso)
- Atributos: `fazenda`, `talhao`, `desc. fazenda`, `proprietario`,
  `variedade`, `area` (em hectares)

### Renderização em canvas

O desenho usa `L.canvas()` em vez do renderizador SVG padrão. Com SVG
o Leaflet criaria um `<path>` por feição — 3.292 elementos de DOM, que
deixam a página pesada e o arraste lento. Em canvas são 1 elemento e
o Leaflet redesenha tudo de uma vez.

### Interação

Clicar num talhão destaca o polígono e abre um popup com os atributos.
Clicar em outro talhão troca a seleção e o conteúdo do popup.

**Clicar numa área sem feição deseleciona.** O realce volta ao estado
base e o popup é fechado. A busca não é desfeita — o termo
continua no campo e os realces continuam no mapa, porque uma consulta
é outra coisa. Para limpar a busca existe o botão do campo.

Isso exige um cuidado: no Leaflet o clique num talhão não para nele.
O evento é encadeado do polígono até o `L.GeoJSON` e daí até o `map`,
 então o handler do mapa roda também quando o clique foi numa feição — e
simplesmente limpar a seleção ali a apagaria no mesmo instante em que
foi aberta. Por isso o handler do grupo marca o clique como tendo
vindo de feição, e o do mapa não age nesse caso.

A marca vale só para o evento em curso, liberada por `setTimeout(0)`.
Como a propagação é síncrona, o handler do mapa roda antes do timeout;
o timeout cobre o caso de o clique ser interceptado antes de chegar ao
mapa, em que a marca sobreviveria e engoliria o próximo clique vazio.

Verificar `propagatedFrom` no handler do mapa não serviria como
alternativa: ele é `false` tanto no clique numa feição quanto no clique
no vazio. Só a ordem de propagação — grupo antes do mapa — distingue os
dois casos.

A camada pode ser ligada e desligada em dois lugares, sempre
sincronizados: o item **Talhões** da seção *Vector* do menu lateral e o
item do dropdown **Camadas** na barra superior. Ao desligar,
a atribuição da fonte sai do rodapé do mapa junto com a camada.

### Dependência de rede

Como o arquivo é lido do GitHub, a camada **exige internet**. Sem
conexão — ou se o GitHub estiver fora do ar — o satélite continua
funcionando normalmente e o rodapé apenas informa *Talhões
indisponíveis*; a caixa de seleção fica desabilitada.

Para tornar o projeto independente de rede, baixe o GeoJSON para
`assets/dados/` e aponte `TALHOES_URL` em `js/map.js` para o caminho
local.

---

## Busca de talhões

A busca fica como painel flutuante no canto superior direito do mapa.
Ela varre os 3.292 talhões **que já estão em memória** — não usa
nenhum serviço de geocodificação, então o projeto continua dependendo
da rede apenas para o satélite e para o GeoJSON.

Ao encontrar algo, a busca realça os talhões em azul e enquadra o mapa
neles. O popup é aberto somente quando o usuário clica diretamente em
uma feição.

### O que é comparado

Um número isolado é tratado como código de fazenda e seleciona todos os
seus talhões. Para selecionar um talhão específico, use
`fazenda,talhão`, por exemplo `1001,2`. Espaços depois da vírgula também
são aceitos.

Os campos indexados são `talhao`, `desc. fazenda`, `fazenda`,
`proprietario` e `variedade`. `area` fica de fora de propósito: é um
número, e buscá-lo faria um "8" digitado casar com quase tudo.

O texto de busca é normalizado uma vez por talhão, no carregamento, e
cada tecla digitada é só um `indexOf` sobre 3.292 strings. A digitação
tem *debounce* de 160 ms, porque o repaint percorre todas as camadas.

### Acentos, caixa e pontuação

A comparação ignora acento, caixa e pontuação, porque os dados grafam
a mesma fazenda de seis jeitos: `OLHOS D AGUA`, `OLHOS D"AGUA`,
`OLHOS DÀGUA`, `OLHOS DAGUA BARBATEZA`, `OLHOS DAGUA-CN` e
`GLORIA, OLHOS DAGUA`. Sem isso, quem digita `olhos d'agua` — a
grafia natural — não acha nada.

A busca tem duas passadas:

1. **Estrita** — cada termo precisa aparecer inteiro, em qualquer
   campo. É o que faz `simão sp80` achar o talhão cuja fazenda é São
   Simão e cuja variedade é SP80, sem exigir que as palavras venham em
   sequência no mesmo campo.
2. **Tolerante** — só quando a primeira volta vazia. Compara o termo
   inteiro contra o texto sem espaços, o que junta `D AGUA` com
   `DAGUA`.

### Três níveis de realce

Todos os estilos são repintados por uma função só, para que um
realce nunca "vaze" de um estado para o outro:

| Estado | Contorno | Preenchimento |
| --- | --- | --- |
| Padrão | amarelo, 1,4 px | amarelo a 10 % |
| Achado na busca | azul, 2,4 px | azul a 28 % |
| Selecionado por clique | branco, 3,2 px | amarelo a 42 % |
| Selecionado por busca | azul escuro, 3,2 px | azul claro a 48 % |

Passar por um repaint único evita o bug de estilos acumulados: sem
ele, limpar a busca devolveria o realce do clique, e clicar num talhão
deixaria o realce da busca por cima.

### Atalhos

- `Enter` dispara a busca na hora, sem esperar o *debounce*.
- `Esc` limpa o campo e apaga o realce.
- Sair do campo **não** apaga o resultado: a busca é um estado, não
  uma edição. Quem descarta é o `×` ou o `Esc`.

Desligar a camada *Talhões* também apaga a busca, porque os talhões
sumiriam do mapa e o realce ficaria invisível e sem sentido.

O contador do item *Resultados da busca*, no dropdown **Análises**,
passa a refletir a busca de verdade, em vez do `0` fixo.

### Layout

A barra fica fora da barra superior, como painel flutuante sobre o mapa.
Em telas menores ocupa a largura disponível sem criar rolagem horizontal.

---

## Módulos de análise

Dois módulos, abertos pelos itens *Previsão climática* (menu
**Análises**) e *Focos de incêndio* (menu **Ferramentas**). Ambos
revelam uma seção da sidebar e abrem o painel. Vêm de
`~/Documents/modulo_analises_climaticas/`.

### Previsão climática

Lê `previsao_bambui.csv` — 56 períodos de 3 h para Bambuí/MG,
gerados pelo notebook `imet_previsao_cidades.ipynb` a partir do
IPMet Radar (estação A565).

**Por que um arquivo e não a consulta direta:** a página do IPMet
não devolve `Access-Control-Allow-Origin` e ainda exige um header
`Referer`, que o navegador não tem como enviar. Buscar ao vivo
daria CORS bloqueado. Um proxy resolveria, mas não há um no
projeto, então o CSV é a única via.

A consequência aparece na tela: a previsão é um retrato da janela
que o arquivo cobre, não o tempo de hoje. Quando a janela já
passou, o módulo mostra um aviso com a data em que termina e o
caminho para regerar o CSV. Sem isso o número pareceria atual.

A lista mostra os períodos que ainda não passaram; se todos já
passaram, mostra o início da janela e avisa. Cellulas sem previsão
saem como `—`, nunca com a unidade grudada (`Chuva —`, e não
`Chuva —%`).

### Focos de incêndio

Consulta o INPE (dataserver-coids) ao vivo. O serviço responde com
`Access-Control-Allow-Origin: *`, então dá para buscar direto do
navegador.

O fluxo é: lê o índice do diretório, pega os nomes dos 3 arquivos
mais recentes e busca cada CSV. Três arquivos dão uma janela de
30 minutos.

**Escopo.** Só interessam os focos perto dos talhões. O país inteiro
queima o tempo todo: numa amostra de 10 406 focos cobrindo três
dias, o mais próximo estava a **97 km**, e nenhum a menos de 50 km.
Sem o filtro, o módulo mostraria o Brasil e os talhões sumiriam no
meio.

O raio é o retângulo dos talhões (lat −20,35 a −19,90 / lon −46,28 a
−45,64) mais **0,5° de folga**, o que dá uma região de uns
170 × 155 km. É largo o bastante para alcançar os focos que de fato
ocorrem por perto e estreito o bastante para continuar falando da
propriedade. O raio fica escrito na tela porque "0" só quer dizer
algo ao lado dele.

O resultado costuma ser zero. Isso é uma resposta — a região está
limpa — e não uma falha. Para que o zero seja legível, a linha de
contexto mostra o total nacional da mesma janela: `0 de 59 focos
distintos no país`. Sem isso não dá para distinguir "não houve
fogo" de "a consulta falhou".

**Dedup.** O mesmo incêndio é redetectado a cada arquivo de 10
minutos, nas mesmas coordenadas. Somar os arquivos sem deduplicar
contaria o mesmo fogo três vezes, então a chave é a coordenada
arredondada a 3 casas (~100 m).

**Falhas.** Os três arquivos são buscados de forma independente: um
que falhe não derruba a janela, porque ainda sobra dado válido. Mas
as falhas são contadas e mostradas (`1 de 3 arquivos não
responderam`). Isso importa: engolir o erro e reportar `0 de 0` seria
um zero confiante, indistinguível de uma região sem fogo.

### Leitor de CSV

`js/csv.js` é compartilhado pelos dois módulos porque os arquivos
têm armadilhas específicas: `previsao_bambui.csv` vem em
`utf-8-sig` (sem remover o BOM, a busca por nome da primeira coluna
erraria) e os CSVs do INPE trazem espaço antes do sinal
(`" -14.626600"`), que vira `NaN` num `parseFloat` apressado.
Células vazias viram `null`, e não `0` — a diferença entre "zero" e
"não informado" importa numa previsão de chuva.

---

## Mapa de teclado

| Tecla | Ação |
| --- | --- |
| `Tab` | Navega pelos controles visíveis |
| `Enter` / `Espaço` | Abre um menu da navegação ou a sidebar |
| `↓` / `↑` | Abre o submenu e move o foco entre os itens |
| `Home` / `End` | Vai para o primeiro / último item do submenu |
| `Esc` | Fecha o submenu; se já estiver fechado, fecha a sidebar. No campo de busca, limpa a busca |
| `+` / `-` | Com o mapa em foco, aumenta ou reduz o zoom (4 a 18) |

Clicar numa área do mapa sem feição deseleciona o talhão. O foco
sempre retorna ao elemento que abriu o painel.

---

## Acessibilidade

- `inert` no painel lateral fechado, para que o teclado não entre em
  conteúdo invisível. Há fallback por `tabindex` em navegadores sem
  suporte nativo.
- `aria-expanded` sincronizado com o estado visual de cada menu.
- O item *Talhões* do dropdown **Camadas** é um `button` com
  `aria-pressed`, não um link — é um interruptor, e o clique não fecha
  o dropdown para permitir ligar e desligar sem reabrir o menu.
- O menu lateral é rotulado por `aria-label` e ocultado por
  `aria-hidden` quando fechado.
- O menu lateral tem **um único controle**: o botão flutuante sobre o
  mapa abre e fecha, trocando o ícone de menu pelo de fechar e
  atualizando o `aria-label` junto. Havia também um `×` no
  cabeçalho do painel, que duplicava a ação; foi removido. O
  cabeçalho ganhou `min-height` para não encolher 5px com a saída
  do botão.
- A busca usa `role="search"`, tem `aria-label` no campo e anuncia o
  resultado por `role="status"` com `aria-live="polite"`.
- Respeita `prefers-reduced-motion: reduce`.
- Foco visível via `:focus-visible` com contorno de 2 px.

---

## Empilhamento

O mapa do Leaflet distribui as camadas internas com `z-index` de 200 a
700. Como o `.map-container` já é um contexto de empilhamento, esses
valores competiam direto com o menu lateral (250) e com o botão que o
abre (300) — o mapa cobria os dois e o painel ficava impossível de
clicar.

O `.map-background` recebe `z-index: 0` para fechar os painéis do
Leaflet dentro do próprio mapa. A ordem pretendida no `.map-container`
volta a valer:

```
mapa (0)  <  menu lateral (250)  <  botão (300)  <  status (400)
```

E, no nível do `.app`, o `.map-container` (1) continua abaixo dos
dropdowns da barra superior (200).

---

## Tema claro / escuro

O botão de lua/sol fica na barra superior, à esquerda do menu de
usuário.

- A preferência é guardada em `localStorage` (`webgis-theme`).
- Sem escolha salva, o site segue a preferência do sistema
  (`prefers-color-scheme`) e **muda em tempo real** se o usuário
  alternar o tema do Windows ou do macOS.
- A troca de tema é feita por um atributo `data-theme` no `<html>`.
  Um script inline no `<head>` o define antes da primeira pintura,
  evitando flash branco ao carregar.
- `color-scheme` acompanha o tema, para que scrollbars e checkboxes
  nativos também fiquem escuros.

Como todas as cores do projeto são custom properties, o bloco
`[data-theme="dark"]` em `style.css` sobrescreve apenas os tokens —
nenhuma regra de layout é alterada, então a alternância não causa
reflow.

> Os tiles do satélite **não** são escurecidos no tema escuro: a
> imagem mantém as cores naturais.

---

## Tokens de cor

As cores estão centralizadas em custom properties no início de
`style.css`. Valores do tema claro:

| Token | Claro | Escuro |
| --- | --- | --- |
| `--color-bg` | `#f5f5f7` | `#1c1c1e` |
| `--color-surface` | `rgba(250,250,252,.96)` | `rgba(44,44,46,.96)` |
| `--color-surface-solid` | `#ffffff` | `#2c2c2e` |
| `--color-map-bg` | `#d9ddd9` | `#232326` |
| `--color-text` | `#1d1d1f` | `#f5f5f7` |
| `--color-text-muted` | `#6e6e73` | `#a1a1a6` |
| `--color-text-subtle` | `#8e8e93` | `#8e8e93` |
| `--color-text-label` | `#3a3a3c` | `#d1d1d6` |
| `--color-brand` | `#50ab46` | `#5bbd51` |
| `--color-accent` | `#ff3b30` | `#ff453a` |
| `--border-hairline` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.12)` |
| `--hover-bg` | `rgba(0,0,0,.045)` | `rgba(255,255,255,.06)` |

As cores fixas dentro dos itens de menu e do painel lateral
(`#0a84ff`, `#ff9f0a`, etc.) representam **dados**, não interface,
e por isso não mudam com o tema.

---

## Conteúdo pendente

Os itens de menu e as camadas do painel lateral são **placeholders**,
exceto *Talhões*, que é a única camada de mapa real, e *Previsão
climática* / *Focos de incêndio*, que são módulos funcionais dentro
do painel. A lista definitiva de camadas, ferramentas e consultas
ainda precisa ser definida — os contadores exibidos nos demais itens
(12, 47, 8, 23) são fictícios.

## Dados que envelhecem

Dois arquivos do módulo de clima estão desatualizados e são
atualizados por fora, não pela página:

| O quê | Situação | Como atualizar |
| --- | --- | --- |
| `previsao_bambui.csv` | Janela de 19 a 25/09/2026, **expirada** | Rodar `imet_previsao_cidades.ipynb` e copiar o CSV para `web_map/` |
| `focos_*.csv` em `dados_queimadas/` | Amostras de 18 a 20/09, só de referência | Não é preciso: o módulo busca o INPE ao vivo |

O CSV de previsão é o ponto frágil: ele expira a cada 7 dias e
ninguém o regera sozinho. Como alternativa ao notebook, dá para
publicar o CSV em algum lugar com CORS liberado e trocar a
constante `CSV_URL` em `js/clima.js` pela URL — o IPMet em si
continua inacessível do navegador.
