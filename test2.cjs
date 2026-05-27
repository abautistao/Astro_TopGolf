const fs = require('fs');
const html = fs.readFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', 'utf8');

let path = [];
let lines = html.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Use a regex that matches `<div...>` and `</div...>` and `<section...>` and `</section...>`
    const tagMatches = line.match(/<div[^>]*>|<\/div>|<section[^>]*>|<\/section>/ig);
    if (!tagMatches) continue;

    for (let tag of tagMatches) {
        if (tag.startsWith('</')) {
            let popped = path.pop();
            if (popped && popped.includes('step-1-details')) {
                console.log(`\n!!! step-1-details CLOSED at line ${i+1}`);
                console.log(`Line content: ${line}`);
            }
        } else {
            let idMatch = tag.match(/id="([^"]+)"/);
            let classMatch = tag.match(/class="([^"]+)"/);
            let name = tag.split(' ')[0].replace('<', '');
            if (idMatch) name += '#' + idMatch[1];
            else if (classMatch) name += '.' + classMatch[1].split(' ')[0];
            path.push(name);
        }
    }
}
