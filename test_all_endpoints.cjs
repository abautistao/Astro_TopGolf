const token = "04c41842431648454421b764fb415a1e9c05dc32e28b2d469b6cd6eaa7ffc9965ef637a7d8142bcb03d906a92838da28b7e99c120038145532aa4650c1212dfe";

async function run() {
    try {
        console.log("\n==================================================");
        console.log("1. FETCHING ALL VENUES: GET /venues");
        console.log("==================================================");

        const venuesRes = await fetch('https://api.sevenrooms.com/2_4/venues', {
            headers: { 'Authorization': token }
        });
        const venuesJson = await venuesRes.json();

        console.log(`Status: ${venuesRes.status}`);
        if (!venuesJson.data || !venuesJson.data.results || venuesJson.data.results.length === 0) {
            console.log("No venues found or error in response:");
            console.log(JSON.stringify(venuesJson, null, 2));
            return;
        }

        console.log(`Total Venues Found: ${venuesJson.data.results.length}`);
        console.log("\nFirst Venue Summary:");
        const firstVenue = venuesJson.data.results[0];
        console.log({
            id: firstVenue.id,
            name: firstVenue.name,
            venue_group_id: firstVenue.venue_group_id,
            venue_group_name: firstVenue.venue_group_name,
            neighborhood: firstVenue.neighborhood,
            address: firstVenue.address,
            phone_number: firstVenue.phone_number
        });

        // Full GET /venues response truncated or printed for debug:
        console.log("\nFull GET /venues Sample data (First venue):");
        console.log(JSON.stringify(firstVenue, null, 2));

        const venueId = firstVenue.id;
        const venueGroupId = firstVenue.venue_group_id;

        console.log("\n==================================================");
        console.log(`2. FETCHING SPECIFIC VENUE: GET /venues/${venueId}`);
        console.log("==================================================");

        const venueDetailRes = await fetch(`https://api.sevenrooms.com/2_4/venues/${venueId}`, {
            headers: { 'Authorization': token }
        });
        const venueDetailJson = await venueDetailRes.json();
        console.log(`Status: ${venueDetailRes.status}`);
        console.log("GET /venues/{venue_id} Response Data:");
        console.log(JSON.stringify(venueDetailJson, null, 2));

        // Use a future date for availability query
        const testDate = "2026-06-15";
        console.log("\n==================================================");
        console.log(`3. FETCHING VENUE AVAILABILITY: GET /venues/${venueId}/availability`);
        console.log(`Querying Date: ${testDate}, Party Size: 2`);
        console.log("==================================================");

        const availRes = await fetch(`https://api.sevenrooms.com/2_4/venues/${venueId}/availability?date=${testDate}&start_time=12:00&end_time=23:00&party_size=2`, {
            headers: { 'Authorization': token }
        });
        const availJson = await availRes.json();
        console.log(`Status: ${availRes.status}`);
        console.log("GET /venues/{venue_id}/availability Response Data:");
        console.log(JSON.stringify(availJson, null, 2).substring(0, 3000) + "\n... (response truncated for console length) ...");

        if (venueGroupId) {
            console.log("\n==================================================");
            console.log(`4. FETCHING VENUE GROUP AVAILABILITY: GET /venue_groups/${venueGroupId}/availability`);
            console.log(`Querying Date: ${testDate}, Party Size: 2`);
            console.log("==================================================");

            const groupAvailRes = await fetch(`https://api.sevenrooms.com/2_4/venue_groups/${venueGroupId}/availability?date=${testDate}&start_time=12:00&end_time=23:00&party_size=2`, {
                headers: { 'Authorization': token }
            });
            const groupAvailJson = await groupAvailRes.json();
            console.log(`Status: ${groupAvailRes.status}`);
            console.log("GET /venue_groups/{venue_group_id}/availability Response Data:");
            console.log(JSON.stringify(groupAvailJson, null, 2).substring(0, 3000) + "\n... (response truncated for console length) ...");
        } else {
            console.log("\nSkipping Venue Group Availability because venue_group_id is not present.");
        }

    } catch (e) {
        console.error("An error occurred during debugging fetch requests:", e);
    }
}

run();
