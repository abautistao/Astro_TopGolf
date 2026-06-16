const fs = require('fs');
let f = fs.readFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', 'utf8');

// Remove Step 2 and 3 from the top stepper
f = f.replace(/\{\/\* Step 2: Extra Time \*\/\}[\s\S]*?\{\/\* Step 4: Payment \*\/\}/g, '{/* Step 4: Payment */}');

// Rename the remaining steps in the top stepper
f = f.replace(/id="step4-wrap"/g, 'id="step2-wrap"');
f = f.replace(/id="step4-icon"/g, 'id="step2-icon"');
f = f.replace(/id="step4-text"/g, 'id="step2-text"');
f = f.replace(/id="step5-wrap"/g, 'id="step3-wrap"');
f = f.replace(/id="step5-icon"/g, 'id="step3-icon"');
f = f.replace(/id="step5-text"/g, 'id="step3-text"');

// Remove the package totals from overview
f = f.replace(/<div class="bg-\[var\(--surface-brand-primary\)\].*?>[\s\S]*?<\/div>\s*<\/div>\s*<div class="flex justify-between items-center mt-2">/g, '<div class="flex justify-between items-center mt-2">');

// Remove the HTML blocks for step 2 and step 3
f = f.replace(/<div id="step-2-extra"[\s\S]*?\{\/\* --- STEP 4: PAYMENT --- \*\/\}/g, '{/* --- STEP 2: PAYMENT --- */}');

// Rename the remaining steps
f = f.replace(/id="step-4-payment"/g, 'id="step-2-payment"');
f = f.replace(/id="step-5-confirmation"/g, 'id="step-3-confirmation"');

// Remove the $16 p.p price from the time slots because we don't have it dynamically
f = f.replace(/<div class="flex items-baseline">\s*<span class="font-\[family-name:var\(--font-principal\)\] text-\[24px\] font-bold">\$16<\/span>\s*<span class="font-\[family-name:var\(--font-secundaria\)\] text-\[12px\] ml-1">p\.p<\/span>\s*<\/div>/g, '');

// Update JS logic
f = f.replace(/const totalSteps = 5;/g, 'const totalSteps = 3;');
f = f.replace(/stepIndex===1\?'-details':stepIndex===2\?'-extra':stepIndex===3\?'-packages':stepIndex===4\?'-payment':'-confirmation'/g, 'stepIndex===1?\'-details\':stepIndex===2?\'-payment\':\'-confirmation\'');

// Remove the package minus/plus buttons logic
f = f.replace(/\/\/ Package minus\/plus buttons[\s\S]*?\/\/ Booking Submission Logic/g, '// Booking Submission Logic');

// Update goToStep(5) to goToStep(3)
f = f.replace(/goToStep\(5\);/g, 'goToStep(3);');

fs.writeFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', f);
console.log('Cleaned up packages successfully');
