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
    const GOOGLE_SHEETS_URL = runtime?.env?.GOOGLE_SHEETS_URL || import.meta.env.GOOGLE_SHEETS_URL;
    const referer = request.headers.get('referer') || 'Directo/Desconocido';

    if (!RESEND_KEY) {
        return new Response(JSON.stringify({ message: "Error de configuración: Falta API Key" }), { status: 500 });
    }

    const resend = new Resend(RESEND_KEY);
    
    const data = await request.formData();

    // --- LÓGICA PARA GOOGLE SHEETS ---
    const sheetData = Object.fromEntries(data.entries());
    // Eliminamos datos binarios o pesados antes de enviar a la hoja
    delete sheetData.CV; 
    delete sheetData['cf-turnstile-response'];
    // AGREGAMOS EL REFERER AL OBJETO DE SHEETS
    sheetData.Referer = referer;

    let sheetError = null;
    if (GOOGLE_SHEETS_URL) {
        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: "POST",
                body: JSON.stringify(sheetData),
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("Error guardando en Sheets:", e);
            sheetError = "Error al registrar en la base de datos";
        }
    }

    const nombre = data.get("Nombre");
    const correo = data.get("Correo");
    const telefono = data.get("Telefono");
    const asunto = data.get("Asunto");
    const mensaje = data.get("Mensaje");

    const recipients = EMAILS.split(",");
    const bcc = EMAILS_BCC.split(",");

    if (!nombre || !asunto || !correo || !telefono || !mensaje) {
        return new Response(
            JSON.stringify({
                message: "Faltan campos requeridos",
            }),
            { status: 400 }
        );
    }

    try {
        const { data: emailData, error } = await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: recipients,
            bcc: bcc,
            subject: "Nuevo registro",
            html: `
        <h1>Nuevo registro</h1>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Correo:</strong> ${correo}</p>
        <p><strong>Teléfono:</strong> ${telefono}</p>
        <p><strong>Asunto:</strong> ${asunto}</p>
        <p><strong>Mensaje:</strong> ${mensaje}</p>
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
