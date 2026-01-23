// src/utils/iconMapper.ts

// 1. Mapa para FontAwesome (Iconos estáticos / Fallback)
export const iconMap: Record<string, string> = {
    // --- Menú Principal (Tus iconos originales) ---
    "shapes": "fa-solid fa-shapes",
    "sterling": "fa-solid fa-sterling-sign",
    "calendar": "fa-regular fa-calendar-check",
    "people": "fa-solid fa-people-group",
    "circle question": "fa-regular fa-circle-question",
    "burger": "fa-solid fa-burger",
    "martini": "fa-solid fa-martini-glass-citrus",

    // --- NUEVOS: Events / Submenú (Con nombres cortos) ---
    "clapping": "fa-solid fa-hands-clapping",
    "briefcase": "fa-solid fa-briefcase",
    "snowflake": "fa-regular fa-snowflake",
    "store": "fa-solid fa-store",
    "cake": "fa-solid fa-cake-candles",
};

// 2. Mapa para Rutas Lottie (Animaciones)
// Vinculamos el nombre corto con el archivo JSON correspondiente
export const lottieMap: Record<string, string> = {
    // --- Menú Principal ---
    "shapes": "/lottie/Games.json",
    "sterling": "/lottie/Pricing.json",
    "calendar": "/lottie/Whats_On.json",
    "people": "/lottie/More_Fun.json",
    "circle question": "/lottie/FAQs.json",
    "burger": "/lottie/Social.json",

    // --- NUEVOS: Events / Submenú ---
    "clapping": "/lottie/Special_Occasions.json",
    "briefcase": "/lottie/Corporate_Events.json",
    "snowflake": "/lottie/Christmas_Events.json",
    "store": "/lottie/Brand_Activations.json",
    "cake": "/lottie/Kids_Birthdays.json",
};

// Función para obtener clase de FontAwesome
export const getIconClass = (strapiIconName: string | null | undefined): string => {
    if (!strapiIconName) return "fa-solid fa-question";
    const key = strapiIconName.toLowerCase().trim();

    if (iconMap[key]) return iconMap[key];

    // Fallback automático: intenta usar el nombre como clase (ej: "user" -> "fa-solid fa-user")
    return `fa-solid fa-${key}`;
};

// Función para obtener ruta de Lottie
export const getLottiePath = (strapiIconName: string | null | undefined): string | null => {
    if (!strapiIconName) return null;
    const key = strapiIconName.toLowerCase().trim();
    return lottieMap[key] || null;
};