const fs = require('fs');
const path = 'src/components/toca/BookingSeven2.astro';
let content = fs.readFileSync(path, 'utf8');

const translations = [
    ["BACK", "VOLVER"],
    ["Details<", "Detalles<"],
    [">Extra Time<", ">Tiempo Extra<"],
    [">Packages<", ">Paquetes<"],
    [">Payment<", ">Pago<"],
    [">Confirmation<", ">Confirmación<"],
    [">Overview<", ">Resumen<"],
    [">OVERVIEW<", ">RESUMEN<"],
    ["Event Bookings", "Reserva de Eventos"],
    ["Want to elevate your experience or plan something bigger? Contact our dedicated sales team to discuss the needs of your event!", "¿Quieres mejorar tu experiencia o planear algo más grande? ¡Contacta a nuestro equipo de ventas para discutir las necesidades de tu evento!"],
    ["Inquire Now", "Consultar Ahora"],
    ["Duration: 75 minutes", "Duración: 75 minutos"],
    ["Duration: 45 minutes", "Duración: 45 minutos"],
    ["Including 30 minutes extra time", "Incluye 30 minutos de tiempo extra"],
    ["1 x Game Box", "1 x Caja de Juego"],
    ["2 Ages 18-21 - $16 per person", "2 Edades 18-21 - $16 por persona"],
    ["*TAX OF $5.12 ADDED (8.25%)", "*IMPUESTO DE $5.12 AÑADIDO (8.25%)"],
    ["Select Location", "Seleccionar Ubicación"],
    ["Select a Venue...", "Seleccionar una Ubicación..."],
    ["Could not load venues from SevenRooms API. Error:", "No se pudieron cargar las ubicaciones desde la API de SevenRooms. Error:"],
    ["Check your token or network connection.", "Verifica tu token o conexión de red."],
    ["How Many Players?", "¿Cuántos Jugadores?"],
    ["TOCA Social is great for groups of all sizes, but we find it most fun with 4 or more.", "TOCA Social es genial para grupos de todos los tamaños, pero consideramos que es más divertido con 4 o más."],
    ["21's and over", "Mayores de 21"],
    ["Age 18 - 20", "Edad 18 - 20"],
    ["UNDER 18's", "Menores de 18"],
    ["Players under 21 years of age must always be supervised by at least one adult (no payment required for non playing adults)", "Los jugadores menores de 21 años deben estar supervisados en todo momento por al menos un adulto (los adultos que no juegan no pagan)"],
    ["Select Date and Time", "Seleccionar Fecha y Hora"],
    ["Select Players First", "Selecciona Jugadores Primero"],
    ["Please select a date to view available times.", "Por favor, selecciona una fecha para ver los horarios disponibles."],
    ["45 minutes", "45 minutos"]
];

for (const [eng, spa] of translations) {
    content = content.split(eng).join(spa);
}

fs.writeFileSync(path, content, 'utf8');
console.log("Translation 1 complete.");
