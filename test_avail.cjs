const t = '04c41842431648454421b764fb415a1e9c05dc32e28b2d469b6cd6eaa7ffc9965ef637a7d8142bcb03d906a92838da28b7e99c120038145532aa4650c1212dfe';
fetch('https://api.sevenrooms.com/2_4/venues', { headers: { Authorization: t } })
    .then(r => r.json())
    .then(d => {
        const v = d.data.results[0].id;
        console.log('Venue:', v);
        return fetch(`https://api.sevenrooms.com/2_4/venues/${v}/availability?date=2026-05-30&start_time=10:00&end_time=23:00&party_size=2`, { headers: { Authorization: t } })
    })
    .then(r => r.json())
    .then(d => console.log(JSON.stringify(d, null, 2).substring(0, 1000)))
    .catch(console.error);
