"""
Embute assets/icons/ui/sprite.svg no index.html.

Os ícones da interface são usados com <svg><use href="#ic-..."/></svg>.
Um <use> que aponta para arquivo externo é bloqueado em file:// e
exige uma requisição a mais; por isso o sprite fica dentro do HTML,
entre os marcadores <!-- SPRITE:INICIO --> e <!-- SPRITE:FIM -->.

Depois de editar o sprite.svg (ou acrescentar um ícone), rode na raiz:

    python tools/embutir_sprite.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
SPRITE = ROOT / "assets" / "icons" / "ui" / "sprite.svg"

START = "<!-- SPRITE:INICIO -->"
END = "<!-- SPRITE:FIM -->"


def main():
    html = HTML.read_text(encoding="utf-8")
    sprite = SPRITE.read_text(encoding="utf-8").strip()

    a = html.index(START) + len(START)
    b = html.index(END)

    html = html[:a] + "\n    " + sprite + "\n    " + html[b:]
    HTML.write_text(html, encoding="utf-8", newline="")

    print(f"Sprite embutido: {sprite.count('<symbol')} ícones.")


if __name__ == "__main__":
    main()
