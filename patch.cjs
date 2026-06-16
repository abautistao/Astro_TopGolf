const fs = require('fs');
let content = fs.readFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', 'utf8');

// 1. Re-add stepper HTML
const step2HTML = `
                {/* Step 2: Extra */}
                <div id="step2-wrap" class="flex flex-col items-center gap-2 opacity-50 transition-opacity">
                    <div id="step2-icon" class="w-12 h-12 rounded-full border-2 border-white/50 bg-[var(--surface-brand-primary)] flex items-center justify-center text-white z-10 transition-colors">
                        <i class="fa-solid fa-star text-xl"></i>
                    </div>
                    <span id="step2-text" class="text-white/50 text-xs font-[family-name:var(--font-principal)] transition-colors">Extras</span>
                </div>`;

content = content.replace(/id="step2-wrap"/g, 'id="step3-wrap"');
content = content.replace(/id="step2-icon"/g, 'id="step3-icon"');
content = content.replace(/id="step2-text"/g, 'id="step3-text"');
content = content.replace(/id="step3-wrap"/g, 'id="step4-wrap"');
content = content.replace(/id="step3-icon"/g, 'id="step4-icon"');
content = content.replace(/id="step3-text"/g, 'id="step4-text"');

content = content.replace(/\{\/\* Step 4: Payment \*\/\}/g, step2HTML + '\n                {/* Step 4: Payment */}');

// 2. Re-add step-2-extra HTML
const step2ContentHTML = `
            {/* --- STEP 2: EXTRA --- */}
            <div id="step-2-extra" class="hidden flex-col gap-8 w-full">
                <div class="bg-white w-full flex flex-col border border-gray-200">
                    <div class="bg-[var(--surface-brand-secondary)] py-2 px-4 border-b-2 border-transparent">
                        <h2 class="text-black font-[family-name:var(--font-principal)] text-[20px] font-bold uppercase tracking-wide">EXTRAS Y MEJORAS</h2>
                    </div>
                    <div class="p-6 md:p-8 bg-white text-black flex flex-col gap-6 relative min-h-[300px]">
                        <p class="font-[family-name:var(--font-secundaria)] text-[16px] font-medium text-black">
                            Selecciona cualquier extra que desees añadir a tu reservación.
                        </p>
                        
                        <div id="step2-upgrades-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full mt-2">
                            {/* Injected dynamically */}
                            <div class="col-span-full p-8 text-center text-gray-500 font-bold">Cargando extras...</div>
                        </div>
                        
                        <div class="flex justify-end mt-8">
                            <button id="b7-btn-extra-confirm" class="bg-white text-black font-[family-name:var(--font-principal)] text-[20px] font-bold uppercase px-8 py-2 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 transition-colors tracking-tight">
                                SIGUIENTE
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

content = content.replace(/id="step-2-payment"/g, 'id="step-3-payment"');
content = content.replace(/id="step-3-confirmation"/g, 'id="step-4-confirmation"');

content = content.replace(/\{\/\* --- STEP 2: PAYMENT --- \*\/\}/g, step2ContentHTML + '\n\n            {/* --- STEP 3: PAYMENT --- */}');

// 3. Update totalSteps and goToStep
content = content.replace(/const totalSteps = 3;/g, 'const totalSteps = 4;');
content = content.replace(/stepIndex===1\?'-details':stepIndex===2\?'-payment':'-confirmation'/g, 'stepIndex===1?\'-details\':stepIndex===2?\'-extra\':stepIndex===3?\'-payment\':\'-confirmation\'');

// 4. Update JS logic (add renderUpgrades)
const renderUpgradesJS = `
        const btnExtraConfirm = document.getElementById('b7-btn-extra-confirm');
        if (btnExtraConfirm) {
            btnExtraConfirm.addEventListener('click', () => {
                goToStep(3);
            });
        }

        async function renderUpgrades(upsellCategories) {
            const container = document.getElementById('step2-upgrades-container');
            if (!container) return;
            
            // PREGUNTA PARA EL CLIENTE (A resolver mañana):
            // TODO: Consultar cómo se deben enviar las mejoras en el Payload de PUT /book.
            // Posibles campos: client_upgrades, upgrades, client_requests...

            if (!upsellCategories || upsellCategories.length === 0) {
                container.innerHTML = '<div class="col-span-full p-8 text-center text-gray-500 font-bold border-2 border-dashed border-gray-300 bg-gray-50/50">No hay extras disponibles.</div>';
                return;
            }

            container.innerHTML = '<div class="col-span-full p-8 text-center"><i class="fa-solid fa-spinner fa-spin text-4xl mb-4 text-[var(--brand-interactive-base)]"></i></div>';

            try {
                let allUpgrades = [];
                const mainSec = document.getElementById('b7-main-section');
                const srToken = mainSec ? mainSec.dataset.token : '';

                // Fetch each category
                for (const catId of upsellCategories) {
                    const res = await fetch(\`https://api.sevenrooms.com/2_4/upgrade_categories/\${catId}/upgrades\`, {
                        headers: { 'Authorization': srToken }
                    });
                    const json = await res.json();
                    if (json.data && json.data.upgrades) {
                        allUpgrades.push(...json.data.upgrades);
                    }
                }

                if (allUpgrades.length === 0) {
                    container.innerHTML = '<div class="col-span-full p-8 text-center text-gray-500 font-bold border-2 border-dashed border-gray-300 bg-gray-50/50">No se encontraron extras.</div>';
                    return;
                }

                window._selectedUpgrades = [];

                container.innerHTML = allUpgrades.map((u, idx) => {
                    const priceStr = u.price > 0 ? \`$\${u.price}\` : 'Gratis';
                    return \`
                    <div class="upgrade-card w-full flex flex-col group border border-gray-300 cursor-pointer hover:border-black transition-colors" data-id="\${u.id}">
                        <div class="bg-[var(--surface-brand-primary)] text-white p-3 flex justify-between items-center h-[60px]">
                            <span class="font-[family-name:var(--font-principal)] text-[16px] font-bold uppercase tracking-wide leading-tight">\${u.name}</span>
                            <div class="checkbox-ui w-6 h-6 border-2 border-white flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-check text-white opacity-0 transition-opacity"></i>
                            </div>
                        </div>
                        <div class="p-4 bg-white text-black flex items-start flex-1 border-x border-gray-300">
                            <div class="font-[family-name:var(--font-secundaria)] text-[12px] text-gray-800 line-clamp-4">
                                \${u.description || ''}
                            </div>
                        </div>
                        <div class="p-4 bg-white flex justify-between items-center border border-gray-300 border-t-0 group-hover:bg-gray-50 transition-colors">
                            <span class="font-[family-name:var(--font-principal)] text-[24px] font-bold tracking-tight">\${priceStr}</span>
                        </div>
                    </div>\`;
                }).join('');

                // Add toggle logic
                const cards = container.querySelectorAll('.upgrade-card');
                cards.forEach(card => {
                    card.addEventListener('click', () => {
                        const id = card.getAttribute('data-id');
                        const isSelected = card.classList.contains('border-black') && card.classList.contains('border-2');
                        const checkIcon = card.querySelector('.fa-check');
                        const checkUi = card.querySelector('.checkbox-ui');

                        if (isSelected) {
                            card.classList.remove('border-black', 'border-2');
                            card.classList.add('border-gray-300', 'border');
                            checkIcon.classList.add('opacity-0');
                            checkUi.classList.remove('bg-[var(--brand-interactive-base)]', 'border-[var(--brand-interactive-base)]');
                            window._selectedUpgrades = window._selectedUpgrades.filter(uid => uid !== id);
                        } else {
                            card.classList.remove('border-gray-300', 'border');
                            card.classList.add('border-black', 'border-2');
                            checkIcon.classList.remove('opacity-0');
                            checkUi.classList.add('bg-[var(--brand-interactive-base)]', 'border-[var(--brand-interactive-base)]');
                            window._selectedUpgrades.push(id);
                        }
                    });
                });

            } catch (e) {
                console.error(e);
                container.innerHTML = '<div class="col-span-full p-8 text-center text-red-500 font-bold">Error cargando mejoras.</div>';
            }
        }
`;

content = content.replace(/\/\/ Booking Submission Logic/g, renderUpgradesJS + '\n        // Booking Submission Logic');

// 5. Restore renderUpgrades call
content = content.replace(/setTimeout\(\(\) => \{\n\s*goToStep\(2\);\n\s*\}, 400\);/g, `
                                            renderUpgrades(selectedTime.shiftUpsells || []);
                                            setTimeout(() => {
                                                goToStep(2);
                                            }, 400);`);

// 6. Update step references from 2 and 3 to 3 and 4 in goToStep calls where needed
content = content.replace(/goToStep\(3\); \/\/ Show confirmation step/g, 'goToStep(4); // Show confirmation step');

fs.writeFileSync('d:/Proyectos/dolphinaris/frontend/src/components/toca/BookingSeven2.astro', content);
console.log("Patch complete!");
