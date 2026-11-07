"""Gera uma versão otimizada de um GeoJSON: coordenadas com N casas
decimais, vértices consecutivos repetidos removidos e JSON compacto.
Opcionalmente simplifica linhas e anéis (Douglas-Peucker) com uma
tolerância em metros. Atributos e ordem das feições são preservados.

Uso: python tools/otimizar_geojson.py entrada.geojson saida.geojson [casas] [tolerancia_m]

  casas         casas decimais (padrão 6, ~10 cm)
  tolerancia_m  simplificação em metros (padrão 0 = não simplifica)
"""
import json
import math
import sys

# Tolerância de simplificação em metros (definida em main).
TOLERANCE_M = 0.0


def simplify(points, tolerance_m):
    """Douglas-Peucker iterativo em metros (projeção local equirretangular).

    Mantém o primeiro e o último ponto; num anel fechado eles são o
    mesmo ponto e a distância ao "segmento" degenerado vira distância
    ao ponto, o que funciona igual.
    """
    if tolerance_m <= 0 or len(points) < 3:
        return points

    lat0 = math.radians(sum(p[1] for p in points) / len(points))
    kx = 111320.0 * math.cos(lat0)
    ky = 110540.0
    xy = [(p[0] * kx, p[1] * ky) for p in points]

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    limit = tolerance_m * tolerance_m

    while stack:
        first, last = stack.pop()
        ax, ay = xy[first]
        bx, by = xy[last]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        worst, index = -1.0, -1

        for i in range(first + 1, last):
            px, py = xy[i]
            if length2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > worst:
                worst, index = d2, i

        if worst > limit:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))

    return [p for p, k in zip(points, keep) if k]


def round_ring(ring, digits):
    out = []
    for x, y, *rest in ring:
        point = [round(x, digits), round(y, digits)]
        if not out or out[-1] != point:
            out.append(point)
    closed = bool(ring) and ring[0][:2] == ring[-1][:2]
    simplified = simplify(out, TOLERANCE_M)
    # Anel fechado precisa de ao menos 4 posições (linha, de 2): se a
    # simplificação colapsar demais, fica só o arredondamento.
    if len(simplified) >= (4 if closed else 2):
        out = simplified
    # Se o arredondamento colapsar o anel, mantém o original arredondado sem deduplicar.
    if closed and len(out) < 4:
        out = [[round(p[0], digits), round(p[1], digits)] for p in ring]
    return out


def round_coords(coords, depth, digits):
    """depth: 0 = posição, 1 = lista de posições (linha/anel), 2+ = aninhado."""
    if depth == 0:
        return [round(coords[0], digits), round(coords[1], digits)]
    if depth == 1:
        return round_ring(coords, digits)
    return [round_coords(c, depth - 1, digits) for c in coords]


DEPTH = {
    "Point": 0, "MultiPoint": 1, "LineString": 1,
    "MultiLineString": 2, "Polygon": 2, "MultiPolygon": 3,
}


def optimize_geometry(geometry, digits):
    if geometry is None:
        return None
    if geometry["type"] == "GeometryCollection":
        return {"type": "GeometryCollection",
                "geometries": [optimize_geometry(g, digits) for g in geometry["geometries"]]}
    if geometry["type"] == "MultiPoint":
        coords = [round_coords(p, 0, digits) for p in geometry["coordinates"]]
    else:
        coords = round_coords(geometry["coordinates"], DEPTH[geometry["type"]], digits)
    return {"type": geometry["type"], "coordinates": coords}


def main():
    source, target = sys.argv[1], sys.argv[2]
    digits = int(sys.argv[3]) if len(sys.argv) > 3 else 6

    global TOLERANCE_M
    TOLERANCE_M = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0

    with open(source, "rb") as handle:
        data = json.loads(handle.read())

    output = {"type": "FeatureCollection"}
    if "name" in data:
        output["name"] = data["name"]
    if "crs" in data:
        output["crs"] = data["crs"]
    output["features"] = [
        {"type": "Feature",
         **({"id": f["id"]} if "id" in f else {}),
         "properties": f.get("properties"),
         "geometry": optimize_geometry(f.get("geometry"), digits)}
        for f in data["features"]
    ]

    with open(target, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(output, handle, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
