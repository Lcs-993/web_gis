# Rampas e paletas de cores do WebGIS

## Estrutura
```
assets/rampas_de_cores/
├── fontes/                 ← arquivos originais (.xml/.qml do QGIS, .gpl de paletas)
├── converter_rampas.py     ← gera rampas.js a partir de fontes/
├── rampas.js               ← dados gerados (window.RAMPAS e window.PALETAS) — não edite à mão
├── rampas-utils.js         ← funções de uso
└── catalogo.html           ← catálogo visual (abre direto via file://)
```

## Adicionar rampas
1. No QGIS: **Configurações › Gerenciador de estilos › Rampas de cores**, selecione e use **Importar/Exportar › Exportar itens** (.xml). Estilos de camada (.qml) e paletas GIMP (.gpl) também são aceitos.
2. Copie os arquivos para `fontes/`.
3. Rode `python converter_rampas.py` (Python 3 normal ou o do QGIS). O relatório mostra o que foi convertido, ignorado ou duplicado.

Tipos suportados: gradient (com paradas, discreta, RGB/HSV), colorbrewer, preset e cpt-city
(para cpt-city, defina a variável de ambiente `CPT_CITY_DIR` apontando para
`...\apps\qgis\resources\cpt-city-qgis-min`). A classificação automática
(sequencial / divergente / multimatiz / categórica) pode ser corrigida em `CLASSIFICACAO_MANUAL` no conversor.

## Usar no WebGIS
O app já usa as rampas no **tema do mapa** (painel Estilos): o `index.html`
carrega `rampas.js` e `js/data/ramps.js` faz as contas (cores em hex, amostra
CSS e quebras Jenks/quantis/intervalos iguais). Rampas novas convertidas aqui
aparecem no seletor sem mexer no código. O `rampas-utils.js` abaixo é para
usos avulsos (outras páginas, testes):

```html
<script src="assets/rampas_de_cores/rampas.js"></script>
<script src="assets/rampas_de_cores/rampas-utils.js"></script>
```

Cor contínua (ex.: talhões por produtividade):
```js
const valores = geojson.features.map(f => f.properties.produtividade);
const min = Math.min(...valores), max = Math.max(...valores);

L.geoJSON(geojson, {
  style: f => ({
    fillColor: corDaRampa('arcmap-12-raster', f.properties.produtividade, min, max),
    fillOpacity: 0.8, color: '#fff', weight: 0.6
  })
}).addTo(map);

legendaRampa('#legenda', 'arcmap-12-raster', min, max, { titulo: 'Produtividade', unidade: 't/ha' });
```

Por classes:
```js
const lim = quebras(valores, 5, 'jenks');            // 'intervalos-iguais' | 'quantis' | 'jenks'
style: f => ({ fillColor: corDaClasse('arcmap-12-raster', f.properties.produtividade, lim) })
legendaRampa('#legenda', 'arcmap-12-raster', min, max, { limites: lim, titulo: 'Produtividade', unidade: 't/ha' });
```

Outras: `classesDaRampa(id, n)`, `gradienteCSS(id)`, `{ inverter: true }` em todas.
Paletas: `PALETAS['arcgis-color-palette'].cores` → `[{ nome, cor: [r,g,b] }]`.

CSS sugerido para a legenda (usa as variáveis de tema da interface):
```css
.legenda-rampa{font-size:12px;color:var(--text)}
.legenda-titulo{font-weight:600;margin-bottom:6px}
.legenda-barra{height:12px;border-radius:6px}
.legenda-rotulos{display:flex;justify-content:space-between;color:var(--text-muted);margin-top:4px}
.legenda-classe{display:flex;align-items:center;gap:8px;margin:3px 0}
.legenda-classe span{width:18px;height:12px;border-radius:3px}
```
