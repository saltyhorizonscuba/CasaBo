// Usage: node tools/cache-bust.js [version]
// Appends ?v=<version> to local assets/images and assets/video references in the pages.
// Re-run with a new version after replacing a file without renaming it.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const version=process.argv[2]||new Date().toISOString().slice(0,10).replace(/-/g,'');
const re=/(?<![\w.\/-])(assets\/(?:images|video)\/[\w.\-]+\.(?:jpe?g|png|webp|mp4))(?:\?v=\w+)?/g;
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='404.html')){
  const p=path.join(root,f);const s=fs.readFileSync(p,'utf8');
  const n=s.replace(re,`$1?v=${version}`);
  if(n!==s){fs.writeFileSync(p,n);console.log(f,'updated');}
}
