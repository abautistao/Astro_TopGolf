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

    if (!RESEND_KEY) {
        return new Response(JSON.stringify({ message: "Error de configuración: Falta API Key" }), { status: 500 });
    }

    const resend = new Resend(RESEND_KEY);
    
    const data = await request.formData();
    const entries = [...data.entries()];
    const file = data.get("CV") as File;
    
    let attachments = [];

    // Validar si el archivo existe y tiene contenido
    if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        // Convertimos el ArrayBuffer a Buffer (compatible con Resend)
        const buffer = Buffer.from(arrayBuffer);
        
        attachments.push({
            content: buffer,
            filename: file.name, // El navegador ya suele incluir la extensión
        });
        
        console.log(`Archivo procesado: ${file.name}`);
    }

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

    const subjectData = attachments.length > 0 ? `Nueva postulación: Bolsa de Trabajo` : 
        `Nuevo Lead: ${data.get('Tipo de Evento') || 'General'} - ${data.get('Nombre') || ''}`;
        
    try {
        const { data: emailData, error } = await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`, // TODO: Update with your verified domain
            to: recipients,
            bcc: bcc,
            subject: subjectData,
            html: `
                <h1>Nuevo registro</h1>
                ${formFields}
            `,
            attachments: attachments.length > 0 ? attachments : undefined,
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
