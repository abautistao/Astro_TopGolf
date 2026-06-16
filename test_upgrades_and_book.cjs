const token = "04c41842431648454421b764fb415a1e9c05dc32e28b2d469b6cd6eaa7ffc9965ef637a7d8142bcb03d906a92838da28b7e99c120038145532aa4650c1212dfe";
const venueId = "ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDNleTAqwsM";

async function testBookingFlow() {
    try {
        console.log("==================================================");
        console.log("1. FETCHING AVAILABILITY");
        console.log("==================================================");
        const testDate = "2026-06-18";
        const availRes = await fetch(`https://api.sevenrooms.com/2_4/venues/${venueId}/availability?date=${testDate}&start_time=12:00&end_time=22:00&party_size=2`, {
            headers: { 'Authorization': token }
        });
        const availJson = await availRes.json();
        
        console.log(`Status: ${availRes.status}`);
        if (!availJson.data || !availJson.data.availability) {
            console.log("No availability data:", availJson);
            return;
        }

        const shift = availJson.data.availability[0];
        console.log(`Shift: ${shift.name}, Closed: ${shift.is_closed}`);
        console.log(`Upsell Categories: ${JSON.stringify(shift.upsell_categories)}`);

        // Check slots
        const times = shift.times || [];
        console.log(`Total Slots returned: ${times.length}`);
        const bookableSlots = times.filter(t => t.type === 'book');
        const requestableSlots = times.filter(t => t.type === 'request' && t.is_requestable);
        const nonBookableSlots = times.filter(t => t.type === 'request' && !t.is_requestable);

        console.log(`- Bookable ('book'): ${bookableSlots.length}`);
        console.log(`- Requestable ('request' & is_requestable:true): ${requestableSlots.length}`);
        console.log(`- Non-requestable ('request' & is_requestable:false): ${nonBookableSlots.length}`);

        if (times.length > 0) {
            console.log("\nSample Slots:");
            console.log("First 3 slots:", JSON.stringify(times.slice(0, 3), null, 2));
        }

        let upgradeCategoryId = null;
        if (shift.upsell_categories && shift.upsell_categories.length > 0) {
            upgradeCategoryId = shift.upsell_categories[0];
        }

        let firstUpgrade = null;
        if (upgradeCategoryId) {
            console.log("\n==================================================");
            console.log(`2. FETCHING UPGRADES FOR CATEGORY: ${upgradeCategoryId}`);
            console.log("==================================================");
            const upgradesRes = await fetch(`https://api.sevenrooms.com/2_4/upgrade_categories/${upgradeCategoryId}/upgrades`, {
                headers: { 'Authorization': token }
            });
            const upgradesJson = await upgradesRes.json();
            console.log(`Status: ${upgradesRes.status}`);
            console.log("Upgrades Count:", upgradesJson.data?.upgrades?.length || 0);
            if (upgradesJson.data?.upgrades?.length > 0) {
                firstUpgrade = upgradesJson.data.upgrades[0];
                console.log("First Upgrade:", JSON.stringify(firstUpgrade, null, 2));
            }
        }

        console.log("\n==================================================");
        console.log(`3. TRYING TO BOOK A RESERVATION (PUT /venues/${venueId}/book)`);
        console.log("==================================================");
        
        // We select a time slot from availability
        let selectedTime = "12:00 PM";
        let cost = 199;
        if (times.length > 0) {
            selectedTime = times[0].time; // e.g. "12:00 PM"
            cost = times[0].cost || 199;
            console.log(`Selected slot: ${selectedTime}, cost: ${cost}`);
        }

        const party_size = 2;
        const payment_subtotal = cost * party_size * 100;

        const formData = new URLSearchParams();
        formData.append('date', testDate);
        formData.append('time', selectedTime);
        formData.append('party_size', party_size.toString());
        formData.append('first_name', 'Test');
        formData.append('last_name', 'User');
        formData.append('phone', '+528110000000');
        formData.append('email', 'testuser@example.com');
        formData.append('notes', 'Test reservation from automated script');
        
        // Let's add paylink flags
        formData.append('payment_by_paylink', 'true');
        formData.append('paylink_email', 'testuser@example.com');
        formData.append('paylink_cancel_time', '60');
        formData.append('payment_subtotal', payment_subtotal.toString());
        
        if (firstUpgrade) {
            const upgradeStr = `{"${firstUpgrade.id}":{"price":${firstUpgrade.price || 0},"quantity":1}}`;
            formData.append('upgrade_inventories', upgradeStr);
        }
        
        console.log("Payload parameters being sent (urlencoded):");
        for (const [key, value] of formData.entries()) {
            console.log(`  ${key}: ${value}`);
        }

        const bookRes = await fetch(`https://api.sevenrooms.com/2_4/venues/${venueId}/book`, {
            method: 'PUT',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        const bookJson = await bookRes.json();
        console.log(`Status: ${bookRes.status}`);
        console.log("Book Response Data:");
        console.log(JSON.stringify(bookJson, null, 2));

    } catch (e) {
        console.error("Error in test script:", e);
    }
}

testBookingFlow();
