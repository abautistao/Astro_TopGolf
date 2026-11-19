// Etiquetas HTML que el editor puede elegir en el CMS para titulos y subtitulos.
// Los registros ya publicados mandan `null` en los campos nuevos (no `undefined`),
// asi que el default de un destructuring no se aplica: se normaliza contra esta
// lista blanca y se cae en la etiqueta por defecto cuando el valor no llega o no es valido.
export const TAGS_HTML = ["h1", "h2", "h3", "h4", "h5", "h6", "span", "p"] as const;

export type TagHtml = (typeof TAGS_HTML)[number];

export const resolverTag = (valor: string | null | undefined, porDefecto: TagHtml): TagHtml => {
    const normalizado = (valor ?? "").trim().toLowerCase();
    return (TAGS_HTML as readonly string[]).includes(normalizado) ? (normalizado as TagHtml) : porDefecto;
};
