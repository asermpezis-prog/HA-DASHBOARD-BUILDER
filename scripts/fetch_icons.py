"""Lädt die Material Design Icons (Schrift + CSS) nach app/static/mdi.

Wird beim Docker-Build ausgeführt, damit die Schrift nicht im Git liegt.
Lokal: python3 scripts/fetch_icons.py
"""
import io
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

VERSION = "7.4.47"
URL = f"https://registry.npmjs.org/@mdi/font/-/font-{VERSION}.tgz"
DEST = Path(__file__).resolve().parent.parent / "app" / "static" / "mdi"


def main():
    with urllib.request.urlopen(URL, timeout=60) as r:
        data = r.read()
    (DEST / "css").mkdir(parents=True, exist_ok=True)
    (DEST / "fonts").mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        css = tar.extractfile("package/css/materialdesignicons.min.css").read().decode("utf-8")
        font = tar.extractfile("package/fonts/materialdesignicons-webfont.woff2").read()
    face = ('@font-face{font-family:"Material Design Icons";'
            f'src:url("../fonts/materialdesignicons-webfont.woff2?v={VERSION}") format("woff2");'
            'font-weight:normal;font-style:normal;font-display:block}')
    css = re.sub(r"@font-face\{[^}]*\}", face, css, count=1)
    (DEST / "css" / "materialdesignicons.min.css").write_text(css, encoding="utf-8")
    (DEST / "fonts" / "materialdesignicons-webfont.woff2").write_bytes(font)
    print(f"Icons {VERSION} nach {DEST} geladen")


if __name__ == "__main__":
    sys.exit(main())
