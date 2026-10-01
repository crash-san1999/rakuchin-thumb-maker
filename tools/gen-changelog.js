// js/changelog.js から CHANGELOG.md を作る（tools/bump-version.sh から呼ばれる）
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const CHANGELOG = new Function(fs.readFileSync(path.join(root, 'js/changelog.js'), 'utf8') + '; return CHANGELOG;')();
let md = '# 更新履歴\n\n（新しい順。アプリ内の「更新履歴」と同じ内容です。js/changelog.js から自動生成）\n';
for(const e of CHANGELOG) md += `\n## ${e.d}　${e.t}\n\n${e.items.map(i => '- ' + i).join('\n')}\n`;
fs.writeFileSync(path.join(root, 'CHANGELOG.md'), md);
