const token = "04c41842431648454421b764fb415a1e9c05dc32e28b2d469b6cd6eaa7ffc9965ef637a7d8142bcb03d906a92838da28b7e99c120038145532aa4650c1212dfe";
const venueId = "ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDNleTAqwsM";

async function checkDates() {
    // Try dates: tomorrow (June 5), next Monday (June 8), June 15, and sizes: 2, 4, 6
    const dates = [];
    const startDate = new Date("2026-06-16");
    for (let d = 0; d < 30; d++) {
        const nextDate = new Date(startDate);
        nextDate.setDate(startDate.getDate() + d);
        dates.push(nextDate.toISOString().split('T')[0]);
    }
    const partySizes = [2, 4];

    for (const date of dates) {
        for (const size of partySizes) {
            const url = `https://api.sevenrooms.com/2_4/venues/${venueId}/availability?date=${date}&start_time=12:00&end_time=20:00&party_size=${size}`;
            try {
                const res = await fetch(url, { headers: { 'Authorization': token } });
                const json = await res.json();
                
                if (json.data && json.data.availability && json.data.availability.length > 0) {
                    const times = json.data.availability[0].times || [];
                    const bookable = times.filter(t => t.type === 'book').length;
                    const reqTrue = times.filter(t => t.type === 'request' && t.is_requestable).length;
                    const reqFalse = times.filter(t => t.type === 'request' && !t.is_requestable).length;
                    
                    console.log(`Date: ${date} | Party Size: ${size} | Total Slots: ${times.length} | Bookable: ${bookable} | Requestable: ${reqTrue} | Non-requestable: ${reqFalse}`);
                } else {
                    console.log(`Date: ${date} | Party Size: ${size} | No availability shift found in response`);
                }
            } catch (e) {
                console.error(`Error querying Date: ${date}, Size: ${size}`, e.message);
            }
        }
    }
}

checkDates();
