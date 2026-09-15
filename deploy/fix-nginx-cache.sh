#!/usr/bin/env bash
#
# Mavjud serverdagi nginx sozlamasiga kesh qoidalarini qo'shadi.
#
# Nima uchun kerak: `index.html` fayl nomlaridagi xeshlarni ko'rsatib turadi.
# Har chiqarilishda xeshlar o'zgaradi va eski fayllar o'chadi. Agar brauzer
# eski `index.html` ni keshdan olsa, u endi mavjud bo'lmagan fayllarni so'raydi
# va ichki sahifalar ochilmay qo'yadi.
#
# Skript idempotent — bir necha marta ishlatish xavfsiz.
#
#   bash deploy/fix-nginx-cache.sh
set -euo pipefail

CONF=/etc/nginx/sites-available/savdoiq
[ -f "$CONF" ] || { echo "Sozlama topilmadi: $CONF"; exit 1; }

cp "$CONF" "$CONF.bak"

python3 - "$CONF" <<'PY'
import re
import sys

path = sys.argv[1]
conf = open(path, encoding='utf-8').read()

# 1. index.html hech qachon keshlanmasin
if 'location = /index.html' not in conf:
    conf = conf.replace(
        '''    location / {
        try_files $uri $uri/ /index.html;
    }''',
        '''    # index.html HECH QACHON keshlanmaydi — u fayl nomlaridagi xeshlarni
    # ko'rsatib turadi va har chiqarilishda o'zgaradi
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }''',
        1,
    )

# 2. Eski chunk so'ralsa index.html emas, aniq 404 qaytsin
block = re.search(r'    location ~\* \\\.\(js\|css[^}]*\}', conf)
if block and 'try_files $uri =404;' not in block.group(0):
    fixed = block.group(0).rstrip('}').rstrip()
    fixed += '\n        # Eski chunk so\'ralsa index.html emas, aniq 404 qaytsin\n        try_files $uri =404;\n    }'
    conf = conf.replace(block.group(0), fixed, 1)

open(path, 'w', encoding='utf-8').write(conf)
print('sozlama yangilandi')
PY

nginx -t && systemctl reload nginx
echo "Nginx qayta yuklandi"
echo
echo "Tekshiruv:"
curl -sI http://127.0.0.1/ | grep -i 'cache-control' || echo "  (Cache-Control topilmadi)"
