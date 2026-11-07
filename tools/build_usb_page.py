"""Build a standalone USB HTML page using only the Python standard library.

Called by PlatformIO before building firmware/LittleFS; also runnable directly.
"""
from pathlib import Path
import re
import json

if 'Import' in globals():
    Import('env')
    # Keep machine-specific home paths out of published firmware, on either
    # Windows or POSIX-style compiler paths. Preserve the test repo's mapping.
    for prefix in {str(Path.home()), Path.home().as_posix()}:
        env.Append(CCFLAGS=[f'-fmacro-prefix-map={prefix}=.', f'-ffile-prefix-map={prefix}=.'])
    ROOT = Path(env['PROJECT_DIR'])
else:
    ROOT = Path(__file__).resolve().parents[1]


def build(root=ROOT):
    version = (root/'VERSION.txt').read_text(encoding='utf-8').strip()
    data = root/'data'
    for language in ('en', 'ja'):
        translations = json.loads((root/f'tools/locales/{language}.json').read_text(encoding='utf-8'))
        catalog = f'/* Generated from tools/locales/{language}.json. */\nconst UI_{language.upper()}='+json.dumps(translations,ensure_ascii=False,separators=(',',':'))+';\n'
        catalog_path = data/f'i18n-{language}.js'
        if not catalog_path.exists() or catalog_path.read_text(encoding='utf-8') != catalog:
            catalog_path.write_text(catalog,encoding='utf-8')
    html = (data/'index.html').read_text(encoding='utf-8')
    # The GUI identifies its own assets, even offline or with older firmware.
    for element in ('headerVersion', 'footerVersion'):
        html = re.sub(r'(<span id="'+element+r'">)[^<]*(</span>)',lambda match:match[1]+'V'+version+match[2],html)
    html = re.sub(r'(/(?:style\.css|app\.js)\?v=)[^"\s]+',lambda match:match[1]+version,html)
    index_path=data/'index.html'
    if index_path.read_text(encoding='utf-8') != html:
        index_path.write_text(html,encoding='utf-8')
    css = (data/'style.css').read_text(encoding='utf-8')
    html = re.sub(r'<link href="/style\.css[^\"]*" rel="stylesheet"\s*/>', lambda _: '<style>'+css+'</style>', html)
    def script(match):
        source = (data/match[1]).read_text(encoding='utf-8')
        # Preserve literal closing-script text inside JS strings, if introduced.
        source = re.sub(r'</script', r'<\\/script', source, flags=re.IGNORECASE)
        return '<script>'+source+'</script>'
    html = re.sub(r'<script src="/([^?\"]+)(?:\?[^\"]*)?" defer></script>', script, html)
    name = 'DEACS_V'+version.replace('.', '_').replace('-', '_')+'_USB.html'
    release = root/'release'
    release.mkdir(exist_ok=True)
    for path in (data/'usb.html', release/name):
        if not path.exists() or path.read_text(encoding='utf-8') != html:
            path.write_text(html, encoding='utf-8')
    return release/name


if __name__ == '__main__':
    print(build())
else:
    # PlatformIO executes extra scripts with SCons Import injected.
    if 'Import' in globals():
        build(Path(env['PROJECT_DIR']))
