import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const {
            venue_id,
            date,
            time,
            party_size,
            first_name,
            last_name,
            email,
            phone,
            access_persistent_id,
            notes,
            client_upgrades,
            payment_subtotal
        } = body;

        // Validations
        if (!venue_id || !date || !time || !party_size || !first_name || !last_name || !phone) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const SEVENROOMS_TOKEN = '04c41842431648454421b764fb415a1e9c05dc32e28b2d469b6cd6eaa7ffc9965ef637a7d8142bcb03d906a92838da28b7e99c120038145532aa4650c1212dfe';
        const url = `https://api.sevenrooms.com/2_4/venues/${venue_id}/book`;

        // The SevenRooms API expects application/x-www-form-urlencoded
        const formData = new URLSearchParams();
        formData.append('date', date);
        formData.append('time', time);
        formData.append('party_size', party_size.toString());
        formData.append('first_name', first_name);
        formData.append('last_name', last_name);
        formData.append('phone', phone);

        if (email) {
            formData.append('email', email);
            // Add paylink fields to auto-generate and email the paylink
            formData.append('payment_by_paylink', 'true');
            formData.append('paylink_email', email);
            formData.append('paylink_cancel_time', '60'); // Cancel in 60 minutes if unpaid
            formData.append('paylink_note', 'Enlace de pago seguro para tu reserva en TOCA Social.');
        }
        if (notes) formData.append('notes', notes);
        // if (access_persistent_id) formData.append('access_persistent_id', access_persistent_id);
        if (payment_subtotal) formData.append('payment_subtotal', payment_subtotal.toString());

        // Format required by SevenRooms: upgrade_inventories={"<id>":{"price":0, "quantity":1}},...
        if (client_upgrades && Array.isArray(client_upgrades)) {
            const upgradesList = client_upgrades.map((u: any) => {
                // If it's a simple string ID (backwards compatibility), format with price 0
                if (typeof u === 'string') {
                    return `{"${u}":{"price":0,"quantity":1}}`;
                }
                return `{"${u.id}":{"price":${u.price || 0},"quantity":${u.quantity || 1}}}`;
            }).join(',');

            if (upgradesList) {
                formData.append('upgrade_inventories', upgradesList);
            }
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': SEVENROOMS_TOKEN,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok || (data.status && data.status >= 400)) {
            // Include exactly what was sent in details
            return new Response(JSON.stringify({ 
                error: data.msg || 'Error booking reservation', 
                details: data,
                sent_payload: formData.toString()
            }), {
                status: response.status || 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
