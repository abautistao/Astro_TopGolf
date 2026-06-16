const fs = require('fs');
const path = 'src/components/toca/BookingSeven2.astro';
let content = fs.readFileSync(path, 'utf8');

const translations = [
    ["UPGRADE - GET 30 MINUTES EXTRA PLAY!", "MEJORA - ¡OBTÉN 30 MINUTOS EXTRA DE JUEGO!"],
    ["This time slot qualifies for 30 minutes extra playtime", "Este horario califica para 30 minutos de juego extra"],
    ["OPTIONS", "OPCIONES"],
    ["This will be applied to all boxes on your booking", "Esto se aplicará a todas las cajas de juego en tu reserva"],
    [">CONFIRM<", ">CONFIRMAR<"],
    ["PACKAGES - FOR THE WHOLE SQUAD", "PAQUETES - PARA TODO EL EQUIPO"],
    ["Upgrade your booking with some pre-booked food and drinks at exclusive online rates (All food and beverage items are subjected to a 20% service charge):", "Mejora tu reserva con alimentos y bebidas anticipados a precios exclusivos en línea (Todos los alimentos y bebidas están sujetos a un cargo por servicio del 20%):"],
    ["ADULT PACKAGES", "PAQUETES PARA ADULTOS"],
    ["MILKSHAKE", "MALTEADA"],
    ["A choice of Oreo, Biscoff or Jammie Dodger flavour", "Una elección de sabor Oreo, Biscoff o Jammie Dodger"],
    ["(Flavour choice to be confirmed in venue)", "(La elección de sabor se confirmará en la ubicación)"],
    ["ONLINE SPECIAL - 10% OFF", "ESPECIAL EN LÍNEA - 10% DE DESCUENTO"],
    ["ANY MAIN & SIDE", "CUALQUIER PLATO PRINCIPAL Y GUARNICIÓN"],
    ["1 person", "1 persona"],
    ["Your choice of a Main & Side from the main menu", "Tu elección de un Plato Principal y Guarnición del menú principal"],
    ["ONLINE SPECIAL - 15% OFF", "ESPECIAL EN LÍNEA - 15% DE DESCUENTO"],
    ["TRAY OF TOCA CHICKEN TENDERS", "BANDEJA DE TIRAS DE POLLO TOCA"],
    ["Suitable for 2-3 people", "Ideal para 2-3 personas"],
    ["A tray of 10 chicken tenders, with a choice of sauce", "Una bandeja de 10 tiras de pollo, con elección de salsa"],
    [">NEXT<", ">SIGUIENTE<"],
    ["YOUR INFORMATION", "TU INFORMACIÓN"],
    ["First Name*", "Nombre*"],
    ["Last Name*", "Apellido*"],
    ["Email Address*", "Correo Electrónico*"],
    ["Phone Number*", "Número de Teléfono*"],
    ["Dietary requirements", "Requisitos dietéticos"],
    ["Date of Birth", "Fecha de Nacimiento"],
    ["Reservation notes", "Notas de la reserva"],
    ["Special occasion?", "¿Ocasión especial?"],
    ["Voucher code", "Código de cupón"],
    ["Cancellation Policy*", "Política de Cancelación*"],
    ["I agree to the", "Acepto la"],
    ["venue's required policy*", "política requerida por la ubicación*"],
    ["I certify I am above the age of 18*", "Certifico que soy mayor de 18 años*"]
];

for (const [eng, spa] of translations) {
    content = content.split(eng).join(spa);
}

fs.writeFileSync(path, content, 'utf8');
console.log("Translation 2 complete.");
