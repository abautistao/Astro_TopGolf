# Manual de Uso del Modo Oscuro (Dark Mode)

Este documento explica cómo utilizar las funciones de ayuda para implementar y reaccionar a los cambios del modo oscuro en los componentes de Astro.

## Introducción

El sistema de modo oscuro se controla a través de un interruptor en el `Footer` y utiliza `localStorage` para persistir la selección del usuario entre visitas. Para que los componentes puedan reaccionar a estos cambios dinámicamente en el lado del cliente, se han creado dos funciones de utilidad en `src/lib/strapi.js`.

## Funciones Disponibles

Las siguientes funciones están disponibles para ser importadas y utilizadas dentro de las etiquetas `<script>` de cualquier componente Astro.

```javascript
import { isDarkModeActive, onThemeChange } from '../lib/strapi.js';
```

### 1. `isDarkModeActive()`

Esta función comprueba si el modo oscuro está activado actualmente. Es útil para establecer un estado inicial al cargar un script.

-   **Retorna**: `boolean` - `true` si el modo oscuro está activo, `false` en caso contrario.

**Ejemplo de uso:**

```javascript
import { isDarkModeActive } from '../lib/strapi.js';

if (isDarkModeActive()) {
    console.log('El modo oscuro está activado.');
    // Puedes aplicar estilos iniciales aquí
}
```

### 2. `onThemeChange(callback)`

Esta función te permite "suscribirte" a los cambios de tema. Ejecutará una función (callback) cada vez que el usuario active o desactive el modo oscuro.

-   **Parámetros**:
    -   `callback`: Una función que se ejecutará al cambiar el tema. Recibe un argumento: `theme`, que será `'dark'` o `'light'`.

**Importante:** La función `callback` también se ejecuta una vez inmediatamente al registrarse, para establecer el estado inicial del componente.

**Ejemplo de uso:**

Este ejemplo muestra cómo cambiar el color de un título cuando el tema cambia.

1.  **Añade un `id` a tu elemento en el HTML:**

    ```astro
    ---
    // Tu código de componente Astro
    ---
    <h2 id="mi-titulo-dinamico">Título del Componente</h2>
    ```

2.  **Usa `onThemeChange` en tu script:**

    ```astro
    <script>
        import { onThemeChange } from '../lib/strapi.js';

        // Selecciona el elemento que quieres modificar
        const titulo = document.getElementById('mi-titulo-dinamico');

        // Suscríbete a los cambios de tema
        onThemeChange((theme) => {
            if (theme === 'dark') {
                // El modo oscuro está activado
                titulo.style.color = '#FFFFFF'; // Cambia el color a blanco
                titulo.textContent = 'Título en Modo Oscuro';
            } else {
                // El modo oscuro está desactivado (modo claro)
                titulo.style.color = ''; // Revierte al color original definido en el CSS
                titulo.textContent = 'Título en Modo Claro';
            }
        });
    </script>
    ```

## Resumen del Flujo

1.  **Identifica el elemento** que necesita cambiar de estilo (color, fondo, etc.) y asígnale un `id` único.
2.  En la etiqueta `<script>` de tu componente, **importa `onThemeChange`** desde `src/lib/strapi.js`.
3.  **Selecciona el elemento** usando `document.getElementById()`.
4.  **Llama a `onThemeChange`** y define la lógica para aplicar y revertir tus estilos dentro de la función callback, basándote en el valor del parámetro `theme`.
