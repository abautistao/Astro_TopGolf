const fs = require('fs');
const html = fs.readFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', 'utf8');

let path = [];
let lines = html.split('\n');

for (let i = 175; i < 380; i++) {
    const line = lines[i];
    
    const tagMatches = line.match(/<div[^>]*>|<\/div>|<section[^>]*>|<\/section>/ig);
    if (!tagMatches) continue;

    for (let tag of tagMatches) {
        if (tag.startsWith('</')) {
            let popped = path.pop();
            console.log(i+1, "CLOSE:", popped);
        } else {
            let idMatch = tag.match(/id="([^"]+)"/);
            let classMatch = tag.match(/class="([^"]+)"/);
            let name = tag.split(' ')[0].replace('<', '');
            if (idMatch) name += '#' + idMatch[1];
            else if (classMatch) name += '.' + classMatch[1].split(' ')[0];
            path.push(name);
            console.log(i+1, "OPEN:", name);
        }
    }
}
