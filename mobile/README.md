# WebGIS Campo (mobile)

Navegador de campo instalável para celular: mapa com as camadas do WebGIS,
GPS, navegação até um destino, medição, pontos e trilhas. Funciona offline
depois da primeira abertura conectada. A interface fica em `mobile/`; a versão
desktop na raiz não é alterada.

## Ferramentas

Barra inferior: **Camadas · Buscar · Medir · Navegar · Pontos**.

- **GPS** (botão de localização à direita): toque para ligar e seguir sua
  posição; arrastar o mapa para de seguir; toque de novo para voltar. O painel
  no topo mostra precisão (verde ≤ 10 m, amarelo ≤ 30 m), velocidade, rumo,
  altitude e **em qual talhão/fazenda você está**. Toque nele para ver as
  coordenadas da sua posição.
- **Buscar**: por qualquer atributo (talhão, fazenda, variedade, coleta…). Com
  GPS ligado, os resultados vêm do mais próximo para o mais distante, e a busca
  vazia lista o que está perto de você. Também aceita coordenadas.
- **Medir**: distância ou área (ha, m² e perímetro), com comprimento de cada
  trecho no mapa. Os pontos entram por toque no mapa, pela **mira** central,
  pela **posição GPS** ou em modo **Caminhar** (um ponto a cada 5 m andando —
  útil para medir o contorno de um talhão a pé). Dá para copiar o resultado ou
  salvá-lo como trilha.
- **Navegar**: até uma feição (botão *Navegar até* nos detalhes), um ponto
  salvo ou uma coordenada digitada. Mostra distância, azimute, tempo estimado e
  uma seta que aponta para o destino em relação à sua frente (bússola do
  aparelho ou direção do movimento). Vibra ao chegar. *Rota por estradas* abre
  o Google Maps. Na mesma aba, **Trilha GPS** grava o caminho percorrido.
- **Pontos**: marque sua posição ou o centro da mira, dê nome e observação, e
  navegue até eles depois. **Toque e segure no mapa** para ver as coordenadas
  de qualquer lugar (decimal, GMS e UTM, local e distância até você).
  Exporte pontos e trilhas em **GPX** (GPS, QGIS, Google Earth) ou
  **GeoJSON** (WebGIS desktop, QGIS).
- **Camadas**: liga e desliga camadas, estilo de cada uma (símbolo único,
  categorias ou graduado), mapa-base (Satélite, Ruas, Nenhum) e tema claro
  (mais legível sob sol forte).

Coordenadas aceitas na busca e em *Ir para coordenada*:

| Formato | Exemplo |
| --- | --- |
| Graus decimais | `-20.0868, -46.0424` ou `-20,0868 -46,0424` |
| Graus, minutos e segundos | `20°05'12"S 46°02'33"O` |
| UTM (zona + banda) | `23K 391015 7778573` (`23S` também vale como sul) |

UTM e GMS são calculados no WGS84; a diferença para o SIRGAS 2000 é menor que
1 m.

## Servidor do app de campo

Se houver servidor configurado (mesma regra do desktop: `?campo=<url>` na URL,
Configurações do desktop neste navegador ou `CAMPO_API.url` em
`js/config.js`), as coletas reais substituem a demonstração. As demais camadas
do servidor aparecem em Camadas e só são baixadas ao serem ativadas. A última
cópia de cada uma fica guardada para uso offline.

## Dados no aparelho

Pontos, trilhas, estilos, tema, mapa-base e a última vista do mapa ficam no
`localStorage` deste navegador. Não são enviados a nenhum servidor — exporte
os arquivos para guardá-los ou levá-los ao desktop. Limpar os dados do site
apaga tudo.

Uma trilha em gravação é salva a cada 15 s e ao sair do app; se o app fechar,
ela volta pausada na próxima abertura.

## Limitações do navegador

- O GPS só é lido com o app aberto e a tela ligada. A opção *Manter a tela
  ligada* (Navegar) impede o bloqueio automático enquanto o GPS estiver ativo.
- A bússola depende do sensor do aparelho. No iPhone, o navegador pede
  permissão no primeiro uso. Sem bússola, a seta usa a direção do movimento
  (ande alguns metros) ou o norte do mapa.
- O mapa-base (Esri) não é guardado offline. Sem conexão, as camadas, a busca,
  o GPS, a medição e os pontos continuam funcionando sobre fundo neutro.
- Localização exige contexto seguro (HTTPS ou `localhost`).

## Executar e instalar

Na raiz do repositório, inicie um servidor HTTP:

```bash
python -m http.server 8899
```

Abra `http://127.0.0.1:8899/mobile/`. Para instalar no celular, publique o
site em HTTPS (o GitHub Pages publica a pasta `mobile/`), abra essa rota no
navegador do celular e use a opção de instalação. A primeira abertura deve
ocorrer conectada para preencher o cache offline.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `index.html` | Estrutura da interface |
| `mobile.js` | Mapa, camadas, GPS, navegação, medição, pontos, busca |
| `geo.js` | Cálculos puros: distância, azimute, área, ponto em polígono, UTM, leitura de coordenadas, GPX/GeoJSON |
| `field-store.js` | Pontos e trilhas no `localStorage` |
| `symbology.js` | Folha de estilo das camadas |
| `sw.js` | Cache offline (escopo `/mobile/`) |

O service worker abre o app e os GeoJSON a partir do cache e busca as versões
novas em segundo plano; a atualização aparece na abertura seguinte. **Ao
publicar mudanças no mobile, aumente `VERSION` em `sw.js`** para que todos os
arquivos sejam baixados de novo juntos. Ao adicionar um arquivo JS importado
pelo mobile, inclua-o em `SHELL`.
