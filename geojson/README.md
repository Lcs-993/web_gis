# GeoJSON versionados

Esta pasta armazena as versões mais atuais dos arquivos GeoJSON que fazem
parte do projeto e que deverão ser incluídas no Git quando houver solicitação
explícita de commit.

## Regras de uso

- Adicionar aqui somente arquivos GeoJSON revisados e destinados ao projeto.
- Preservar os arquivos existentes até que uma nova versão seja validada.
- Usar nomes descritivos e estáveis, por exemplo:
  `pol_talhoes.geojson`.
- Evitar arquivos temporários, cópias de trabalho, backups e dados sem
  validação.
- Não realizar commits automaticamente; o commit será feito somente quando
  solicitado.

## Validação mínima antes do commit

Cada arquivo deve:

1. ser um `FeatureCollection` GeoJSON válido;
2. possuir uma lista `features`;
3. declarar ou seguir o CRS adotado pelo projeto;
4. estar em WGS84 (CRS84 / EPSG:4326) — nenhum atributo específico é exigido;
5. ser conferido quanto ao tamanho e à origem dos dados.

## Estado atual

| Arquivo | Origem | Feições | Tamanho |
| --- | --- | --- | --- |
| `pol_talhoes.geojson` | `Lcs-993/meus_layers`, commit `225cf99` | 3.343 | 9,3 MB (2,3 MB comprimido) |
| `usina.geojson` | coordenada informada (lat −20,0868, lon −46,0424) | 1 | < 1 KB |
| `pol_fazendas.geojson` | exportação do QGIS (origem em `dados_origem/`, fora do Git) | 175 | 1,0 MB (0,27 MB comprimido) |

As camadas do catálogo (`js/config.js`, `LAYERS`) carregam esses arquivos,
servidos pelo próprio site. O workflow de publicação já inclui esta pasta.

## Otimização

Os arquivos daqui são versões otimizadas do dado de origem, geradas com:

```bash
python tools/otimizar_geojson.py origem.geojson geojson/pol_talhoes.geojson 6
```

- coordenadas com 6 casas decimais (~10 cm), que sobram para talhões;
- vértices consecutivos repetidos (após o arredondamento) removidos;
- JSON compacto, sem espaços;
- atributos, ordem das feições, `name` e `crs` preservados.

`pol_fazendas.geojson` também foi simplificado (Douglas-Peucker, tolerância de
1 m), por ser só referência visual dos limites:

```bash
python tools/otimizar_geojson.py dados_origem/pol_fazendas.geojson geojson/pol_fazendas.geojson 6 1
```

Resultado: 175 feições, atributos idênticos, nenhum anel inválido; 2,1 milhões
→ 41,6 mil vértices; 88,8 MB → 1,0 MB.

Validação feita em `pol_talhoes.geojson`: mesmas 3.343 feições, atributos idênticos,
deslocamento máximo de ~5,5 cm, nenhum anel inválido. 15,7 MB → 9,3 MB
(5,5 MB → 2,3 MB trafegados).

Para atualizar o dado: baixe a nova versão da origem, rode o script, confira
contagem e atributos, e anote o commit de origem na tabela acima.

Arquivos podem ser abertos sem alterar código por **Ferramentas › Adicionar
dados** (GeoJSON, KML ou KMZ).
