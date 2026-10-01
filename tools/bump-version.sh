#!/bin/sh
# CSS・JavaScript・index.html の内容からバージョン番号を作り、index.html の ?v= と sw.js の APP_VER をまとめて書き換える
# （公開サイトで古いファイルと新しいファイルが混ざらないようにするため／アプリ版に「新しいバージョンがあります」を出すため。ファイルを変えたら実行する）
cd "$(dirname "$0")/.." || exit 1
V=$( (cat css/app.css $(find js -name '*.js' | sort) manifest.webmanifest; sed -E 's/\?v=[0-9a-zA-Z_]+//g' index.html) | md5sum | cut -c1-8)
sed -i -E "s/\?v=[0-9a-zA-Z_]+/?v=$V/g" index.html
sed -i -E "s/^const APP_VER = '[^']*';/const APP_VER = '$V';/" sw.js
echo "version: $V"
