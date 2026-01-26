export const prerender = false;

import type { APIRoute } from "astro";
import { Resend } from "resend";


export const POST: APIRoute = async ({ request, locals }) => {
    // 1. Obtener la variable de entorno según el entorno (Cloudflare o Local)
    // En Cloudflare production, las variables viven en locals.runtime.env
    const runtime = locals.runtime;
    const RESEND_KEY = runtime?.env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;

    if (!RESEND_KEY) {
        return new Response(JSON.stringify({ message: "Error de configuración: Falta API Key" }), { status: 500 });
    }

    const resend = new Resend(RESEND_KEY);
    
    const data = await request.formData();
    const entries = [...data.entries()];
    

    const userEmailEntry = entries.find(([key]) => key.toLowerCase().includes('correo') || key.toLowerCase().includes('email'));
    const userEmail = userEmailEntry ? userEmailEntry[1].toString() : null;

    const formFields = entries.map(([key, value]) => {
        // Opcional: Omitir campos técnicos como tokens de captcha o el checkbox de aceptación si no aporta valor visual
        if (key === 'cf-turnstile-response') return ''; 
        let fieldValue = value
        if(key === 'Acepto solicitud') {
            fieldValue = value ? "Sí" : "No"
        }
        
        return `
            <p><strong>${key}:</strong> ${fieldValue}</p>
        `;
    }).join('');

    try {
        const { data: emailData, error } = await resend.emails.send({
            from: "Contacto Topgolf <contacto@topgolf.com.mx>", // TODO: Update with your verified domain
            to: ["ventas_mty@topgolf.com.mx","agonzalez@topgolf.com.mx","ffraga@topgolf.com.mx"],
            bcc: ["abautista@venturae.com.mx"],
            subject: `Nuevo Lead: ${data.get('Tipo de Evento') || 'General'} - ${data.get('Nombre') || ''}`,
            html: `
        <h1>Nuevo registro</h1>
        ${formFields}
      `,
        });

        if (error) {
            return new Response(
                JSON.stringify({
                    message: error.message,
                }),
                { status: 500 }
            );
        }

        return new Response(
            JSON.stringify({
                message: "Correo enviado exitosamente",
                id: emailData?.id
            }),
            { status: 200 }
        );
    } catch (e) {
        return new Response(
            JSON.stringify({
                message: "Error interno del servidor",
            }),
            { status: 500 }
        );
    }
};
