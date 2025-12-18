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
    const nombre = data.get("nombre");
    const apellido = data.get("apellido");
    const correo = data.get("correo");
    const telefono = data.get("telefono");
    const estado = data.get("estado");
    const aceptacion = data.get("aceptacion");

    if (!nombre || !apellido || !correo || !telefono || !estado || !aceptacion) {
        return new Response(
            JSON.stringify({
                message: "Faltan campos requeridos",
            }),
            { status: 400 }
        );
    }

    try {
        const { data: emailData, error } = await resend.emails.send({
            from: "Contacto Topgolf <contacto@topgolf.com.mx>", // TODO: Update with your verified domain
            to: ["efrenpech@gmail.com","abautista@venturae.com.mx"], // TODO: Update with the recipient email
            subject: "Nuevo registro de newsletter",
            html: `
        <h1>Nuevo registro</h1>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Apellido:</strong> ${apellido}</p>
        <p><strong>Correo:</strong> ${correo}</p>
        <p><strong>Teléfono:</strong> ${telefono}</p>
        <p><strong>Estado:</strong> ${estado}</p>
        <p><strong>Aceptó términos:</strong> ${aceptacion ? "Sí" : "No"}</p>
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
