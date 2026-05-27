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
            if (popped && popped.includes('lg:col-span-8')) {
                console.log(`\n!!! lg:col-span-8 CLOSED at line ${i+1}`);
                console.log(`Line content: ${line}`);
                console.log(`Current path before popping: ${path.join(' > ')} > ${popped}\n`);
            }
        } else {
            let idMatch = tag.match(/id="([^"]+)"/);
            let classMatch = tag.match(/class="([^"]+)"/);
            let name = tag.split(' ')[0].replace('<', '');
            if (idMatch) name += '#' + idMatch[1];
            else if (classMatch) name += '.' + classMatch[1].split(' ')[0];
            path.push(name);
            
            if (tag.includes('lg:col-span-8')) {
                console.log(`lg:col-span-8 OPENED at line ${i+1}`);
            }
            if (tag.includes('id="step-1-details"')) {
                console.log(`step-1-details OPENED at line ${i+1}`);
            }
            if (tag.includes('id="step-2-extra"')) {
                console.log(`step-2-extra OPENED at line ${i+1}`);
            }
        }
    }
}
