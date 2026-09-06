"""Transforma os HTML gerados por scripts/ebooks.cjs em PDF.

    node scripts/ebooks.cjs      → escreve ebooks/fonte/*.html
    python scripts/ebooks-pdf.py → escreve ebooks/*.pdf

Usa o Chromium do Playwright para imprimir. É o mesmo motor do navegador, então
o que sai no PDF é o que se vê na tela — sem uma segunda implementação de
layout para manter.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'ebooks' / 'fonte'
DESTINO = RAIZ / 'ebooks'


def main():
    fontes = sorted(FONTE.glob('*.html'))
    if not fontes:
        print('nada em ebooks/fonte — rode antes: node scripts/ebooks.cjs')
        return 1

    DESTINO.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        for f in fontes:
            pg.goto(f.as_uri(), wait_until='networkidle')
            # a fonte vem do Google Fonts; sem esperar, a primeira página sai
            # com a fonte de reserva e o resto com a certa
            pg.wait_for_timeout(1200)
            saida = DESTINO / (f.stem + '.pdf')
            pg.pdf(path=str(saida), format='A4', print_background=True,
                   margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'})
            kb = saida.stat().st_size / 1024
            print('%-42s %6.0f KB' % (saida.name, kb))
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
