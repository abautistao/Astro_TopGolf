export const prerender = false;

import type { APIRoute } from "astro";
import { Resend } from "resend";


export const POST: APIRoute = async ({ request, locals }) => {
    // 1. Obtener la variable de entorno según el entorno (Cloudflare o Local)
    // En Cloudflare production, las variables viven en locals.runtime.env
    const runtime = locals.runtime;
    const RESEND_KEY = runtime?.env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
    const EMAILS = runtime?.env?.EMAIL_RECIPIENTS || import.meta.env.EMAIL_RECIPIENTS;
    const EMAILS_BCC = runtime?.env?.EMAIL_BCC || import.meta.env.EMAIL_BCC;
    const FROM_EMAIL = runtime?.env?.FROM_EMAIL || import.meta.env.FROM_EMAIL;
    const FROM_NAME = runtime?.env?.FROM_NAME || import.meta.env.FROM_NAME;
    const GOOGLE_SHEETS_URL = runtime?.env?.GOOGLE_SHEETS_NIGHTS_URL || import.meta.env.GOOGLE_SHEETS_NIGHTS_URL;
    const referer = request.headers.get('referer') || 'Directo/Desconocido';

    if (!RESEND_KEY) {
        return new Response(JSON.stringify({ message: "Error de configuración: Falta API Key" }), { status: 500 });
    }

    const resend = new Resend(RESEND_KEY);
    
    const data = await request.formData();

    // --- LÓGICA PARA GOOGLE SHEETS ---
    const sheetData = Object.fromEntries(data.entries());
    sheetData.Referer = referer;

    let sheetError = null;
    if (GOOGLE_SHEETS_URL) {
        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: "POST",
                body: JSON.stringify(sheetData),
                headers: { "Content-Type": "application/json" }
            });


            return new Response(
            JSON.stringify({
                message: "Datos recibidos exitosamente",
            }),
            { status: 200 }
        );
        } catch (e) {
            console.error("Error guardando en Sheets:", e);
            sheetError = "Error al registrar en la base de datos";
        }
    }
    
    const entries = [...data.entries()];

    const recipients = EMAILS.split(",");
    const bcc = EMAILS_BCC.split(",");

    const formFields = entries.map(([key, value]) => {
        // Opcional: Omitir campos técnicos como tokens de captcha o el checkbox de aceptación si no aporta valor visual
        if (key === 'cf-turnstile-response') return ''; 
        if(key === 'CV') return;
        let fieldValue = value
        if(key === 'Acepto solicitud') {
            fieldValue = value ? "Sí" : "No"
        }
        
        return `
            <p><strong>${key}:</strong> ${fieldValue}</p>
        `;
    }).join('');

    const subjectData = `Nuevo Lead Topgolf Nights: - ${data.get('Nombre Completo') || ''}`;
        
    try {
        const { data: emailData, error } = await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`, // TODO: Update with your verified domain
            to: recipients,
            bcc: bcc,
            subject: subjectData,
            html: `
                <h1>Lead: </h1>
                ${formFields}
            `,
        },);

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