const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const dirFile = path.join(dir, file);
    const dirent = fs.statSync(dirFile);
    if (dirent.isDirectory()) {
      if (file !== 'node_modules' && file !== '.expo' && file !== '.git') {
        filelist = walkSync(dirFile, filelist);
      }
    } else {
      if (dirFile.endsWith('.tsx') || dirFile.endsWith('.ts') || dirFile.endsWith('.js')) {
        filelist.push(dirFile);
      }
    }
  }
  return filelist;
};

const allFiles = walkSync('app').concat(walkSync('src'));
allFiles.push('App.tsx');

let modifiedCount = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  content = content.replace(/activeOpacity=\{[\d\.]+\}/g, 'activeOpacity={0.95}');
  
  content = content.replace(/<TouchableOpacity(?![^>]*activeOpacity)/g, '<TouchableOpacity activeOpacity={0.95}');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Updated opacity in ${modifiedCount} files.`);
