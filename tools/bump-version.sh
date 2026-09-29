#!/bin/sh
# CSS・JavaScript の内容からバージョン番号を作り、index.html の ?v= をまとめて書き換える
# （公開サイトで古いファイルと新しいファイルが混ざらないようにするため。ファイルを変えたら実行する）
cd "$(dirname "$0")/.." || exit 1
V=$(cat css/app.css $(find js -name '*.js' | sort) | md5sum | cut -c1-8)
sed -i -E "s/\?v=[0-9a-zA-Z_]+/?v=$V/g" index.html
echo "version: $V"
