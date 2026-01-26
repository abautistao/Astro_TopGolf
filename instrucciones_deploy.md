# Guía de Despliegue y Automatización: Astro + Strapi en AWS

**Autor:** Ing. Efren Pech
**Stack:** Jamstack (Astro, Strapi), AWS
**Dominio de Ejemplo:** `dev.topgolf.com.mx`
**Backend Strapi:** `https://cms-topgolf.venturaentertainment.mx/`

---

## Introducción

Este documento técnico describe el proceso completo para desplegar un sitio web estático generado con **Astro** en la infraestructura de **AWS**, y cómo automatizar su reconstrucción y despliegue a través de un pipeline de CI/CD que se activa mediante webhooks desde un **CMS Headless Strapi**.

La arquitectura propuesta sigue las mejores prácticas de Jamstack, garantizando un rendimiento óptimo, alta seguridad, escalabilidad global y eficiencia de costos.

---

## Parte 1: Configuración Inicial del Despliegue Estático

Esta sección cubre la configuración manual y única de la infraestructura de AWS para servir el sitio estático de Astro.

### 1.1. Preparación del Proyecto Astro

Antes de interactuar con AWS, es fundamental asegurar que el proyecto Astro esté configurado para generar un sitio estático.

1.  **Configuración de Salida Estática:**
    Verifica que tu archivo `astro.config.mjs` tenga la propiedad `output` configurada como `'static'`.

    ```javascript
    // astro.config.mjs
    import { defineConfig } from 'astro/config';

    export default defineConfig({
      output: 'static'
      // ... otras configuraciones
    });
    ```

2.  **Comando de Build:**
    El comando para generar los archivos estáticos es:
    ```bash
    npm run build
    ```
    Esto creará una carpeta `dist/` en la raíz de tu proyecto. Esta carpeta contiene el sitio web completo que subiremos a AWS.

### 1.2. Configuración de AWS S3 (Almacenamiento de Archivos)

Usaremos S3 para almacenar los archivos estáticos generados por Astro.

1.  **Creación del Bucket S3:**
    *   Ve a la consola de AWS -> S3.
    *   Crea un nuevo bucket. El nombre del bucket debe ser **exactamente el mismo que tu dominio** para aprovechar ciertas configuraciones: `dev.topgolf.com.mx`.
    *   Selecciona la región de AWS que prefieras (ej. `us-east-1`).
    *   **Importante:** En la sección "Block Public Access settings for this bucket", mantén **todas las casillas marcadas**. No queremos que el bucket sea públicamente accesible directamente. El acceso se gestionará a través de CloudFront para mayor seguridad.

2.  **Subida Manual Inicial (Opcional):**
    Para verificar la configuración, puedes subir manualmente el contenido de tu carpeta `dist/` al bucket.

### 1.3. Configuración de AWS CloudFront (CDN Global)

CloudFront es la pieza clave para el rendimiento y la seguridad. Servirá como nuestra CDN, distribuirá el contenido globalmente y gestionará el SSL.

1.  **Solicitar un Certificado SSL (ACM):**
    *   Ve a AWS Certificate Manager (ACM).
    *   Asegúrate de estar en la región **N. Virginia (`us-east-1`)**, ya que es un requisito para usar certificados con CloudFront.
    *   Solicita un nuevo certificado público para el dominio `dev.topgolf.com.mx`.
    *   Completa el proceso de validación (generalmente por DNS, que es el método más sencillo si tu dominio está en Route 53).

2.  **Creación de la Distribución de CloudFront:**
    *   Ve a la consola de AWS -> CloudFront.
    *   Haz clic en "Create Distribution".
    *   **Origin Domain:** Selecciona tu bucket S3 de la lista (ej. `dev.topgolf.com.mx.s3.amazonaws.com`).
    *   **Origin Access:** Selecciona **"Origin access control settings (recommended)"**.
        *   Haz clic en "Create control setting". Mantén los valores por defecto y crea.
        *   **Justificación:** OAC (Origin Access Control) es la evolución de OAI. Crea una política de recursos que permite a CloudFront acceder al contenido de S3 de forma segura, mientras que el bucket permanece privado para el resto del mundo. Es la práctica de seguridad recomendada.
    *   Después de crear el OAC, CloudFront te mostrará una política de bucket. **Cópiala**. Ve a tu bucket S3 -> Permissions -> Bucket policy y pega el JSON proporcionado. Esto autoriza a tu distribución de CloudFront a leer los objetos del bucket.

3.  **Configuración de Comportamientos (Behaviors):**
    *   **Viewer Protocol Policy:** Selecciona **"Redirect HTTP to HTTPS"**.
    *   **Allowed HTTP Methods:** Selecciona **"GET, HEAD, OPTIONS"**.
    *   **Cache Policy:** Usa la política gestionada `CachingOptimized`.
    *   **Default Root Object:** Escribe `index.html`. Esto asegura que las visitas a `https://dev.topgolf.com.mx/` sirvan el archivo `index.html` principal.

4.  **Configuración de la Distribución (Settings):**
    *   **Alternate Domain Names (CNAMEs):** Añade `dev.topgolf.com.mx`.
    *   **Custom SSL Certificate:** Selecciona el certificado que creaste en ACM.
    *   Crea la distribución. El despliegue puede tardar varios minutos.

### 1.4. Configuración de AWS Route 53 (DNS)

El último paso es apuntar tu dominio a la nueva distribución de CloudFront.

1.  **Crear un Registro Alias:**
    *   Ve a la consola de AWS -> Route 53 -> Hosted zones.
    *   Selecciona la zona hospedada para `topgolf.com.mx`.
    *   Haz clic en "Create record".
    *   **Record name:** `dev`.
    *   **Record type:** `A`.
    *   Activa el interruptor **"Alias"**.
    *   **Route traffic to:** Selecciona "Alias to CloudFront distribution" y elige tu distribución de la lista.
    *   Crea el registro.

Una vez completado, `dev.topgolf.com.mx` debería servir tu sitio de Astro a través de la red global de CloudFront.

---

## Parte 2: Pipeline de CI/CD Automatizado

Esta sección detalla cómo automatizar el proceso de build y deploy cada vez que se publica contenido en Strapi.

### 2.1. El Disparador: Webhook en Strapi

El proceso comienza en Strapi. Crearemos un webhook que notifique a nuestro sistema de CI/CD cuando el contenido cambie.

1.  **Configuración del Webhook:**
    *   En tu panel de Strapi, ve a `Settings -> Webhooks`.
    *   Crea un nuevo webhook.
    *   **Name:** `Astro Build Trigger`.
    *   **URL:** Dejaremos esto en blanco por ahora. Lo llenaremos con la URL de API Gateway del siguiente paso.
    *   **Events:** Selecciona los eventos que deben disparar una reconstrucción. Los más comunes son:
        *   `entry.publish`
        *   `entry.unpublish`
    *   Guarda el webhook.

### 2.2. El Orquestador: API Gateway + Lambda

El webhook de Strapi necesita un endpoint público para enviar su notificación. Usaremos API Gateway, que a su vez invocará una función Lambda para iniciar nuestro pipeline.

1.  **Crear la Función Lambda:**
    *   Ve a AWS Lambda -> Functions -> Create function.
    *   **Function name:** `start-astro-build-pipeline`.
    *   **Runtime:** Node.js (la última versión LTS).
    *   **Permissions:** Crea un nuevo rol con permisos básicos de Lambda. Más adelante le añadiremos permisos para CodePipeline.
    *   **Código de la función (`index.mjs`):**
        ```javascript
        import { CodePipelineClient, StartPipelineExecutionCommand } from "@aws-sdk/client-codepipeline";

        const codepipeline = new CodePipelineClient({});
        const pipelineName = process.env.PIPELINE_NAME; // Lo configuraremos en Lambda

        export const handler = async (event) => {
          console.log("Webhook recibido, iniciando pipeline:", pipelineName);

          try {
            const command = new StartPipelineExecutionCommand({ name: pipelineName });
            await codepipeline.send(command);
            
            return {
              statusCode: 200,
              body: JSON.stringify({ message: `Pipeline ${pipelineName} iniciado con éxito.` }),
            };
          } catch (error) {
            console.error("Error al iniciar el pipeline:", error);
            return {
              statusCode: 500,
              body: JSON.stringify({ message: "Error interno del servidor." }),
            };
          }
        };
        ```
    *   **Configuración:** En la pestaña `Configuration -> Environment variables`, añade una variable llamada `PIPELINE_NAME` con el nombre que le darás a tu CodePipeline (ej. `astro-static-site-pipeline`).
    *   **Permisos IAM:** Ve al rol IAM asociado a esta Lambda y añade el permiso `codepipeline:StartPipelineExecution` para el recurso de tu pipeline.

2.  **Crear el API Gateway:**
    *   Ve a AWS API Gateway -> Create API.
    *   Elige **"HTTP API"** y haz clic en "Build".
    *   **Integrations:** Selecciona `Lambda` y elige tu función `start-astro-build-pipeline`.
    *   **API name:** `strapi-webhook-trigger`.
    *   **Route:** `POST /start-build`.
    *   Revisa y crea la API.
    *   Una vez creada, obtén la **Invoke URL**. Esta es la URL que debes pegar en la configuración del webhook de Strapi.

### 2.3. El Pipeline: AWS CodePipeline

CodePipeline orquestará el proceso de build y deploy.

1.  **Crear el Pipeline:**
    *   Ve a AWS CodePipeline -> Pipelines -> Create pipeline.
    *   **Pipeline name:** `astro-static-site-pipeline` (o el nombre que pusiste en la variable de entorno de Lambda).
    *   **Service role:** Permite que CodePipeline cree un nuevo rol.

2.  **Etapa 1: Fuente (Source):**
    *   **Source provider:** Elige dónde está tu código (GitHub, AWS CodeCommit, etc.).
    *   Completa la conexión con tu repositorio y selecciona la rama principal.

3.  **Etapa 2: Compilación (Build):**
    *   **Build provider:** AWS CodeBuild.
    *   **Project name:** Crea un nuevo proyecto de CodeBuild.
    *   **Environment:**
        *   Image: `aws/codebuild/standard:7.0` (o una imagen estándar reciente).
        *   Operating System: `Ubuntu`.
    *   **Buildspec:** Selecciona "Use a buildspec file". CodeBuild buscará un archivo `buildspec.yml` en la raíz de tu repositorio.
    *   **Permisos IAM:** El rol de servicio de CodeBuild necesitará permisos para:
        *   Escribir logs en CloudWatch (generalmente se añade por defecto).
        *   Acceder al bucket S3 (`s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`).
        *   Crear invalidaciones en CloudFront (`cloudfront:CreateInvalidation`).

4.  **Archivo `buildspec.yml`:**
    Crea este archivo en la raíz de tu proyecto Astro.

    ```yaml
    version: 0.2

    phases:
      install:
        runtime-versions:
          nodejs: 20
        commands:
          - echo "Instalando dependencias de NPM..."
          - npm install
      build:
        commands:
          - echo "Iniciando el build de Astro..."
          - npm run build
      post_build:
        commands:
          - echo "Sincronizando archivos con el bucket S3..."
          - aws s3 sync dist/ s3://dev.topgolf.com.mx --delete
          - echo "Creando invalidación de caché en CloudFront..."
          - aws cloudfront create-invalidation --distribution-id TU_DISTRIBUTION_ID --paths "/*"

    artifacts:
      files:
        - '**/*'
      base-directory: 'dist'
    ```
    **Nota:** Reemplaza `dev.topgolf.com.mx` con el nombre de tu bucket y `TU_DISTRIBUTION_ID` con el ID de tu distribución de CloudFront. El comando `aws s3 sync --delete` es crucial para eliminar archivos del bucket que ya no existen en el nuevo build.

5.  **Etapa 3: Despliegue (Deploy):**
    *   **Omite esta etapa.** La hemos integrado en la fase `post_build` del `buildspec.yml` para tener un control más granular (sync + invalidation). Es una práctica común y más eficiente para sitios estáticos.

---

## Consideraciones de Seguridad y Permisos (IAM)

Es vital que cada servicio tenga solo los permisos que necesita.

*   **Rol de Lambda (`start-astro-build-pipeline-role`):**
    *   Política de confianza para `lambda.amazonaws.com`.
    *   Permisos: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.
    *   Permiso en línea:
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "codepipeline:StartPipelineExecution",
                    "Resource": "arn:aws:codepipeline:REGION:ACCOUNT_ID:astro-static-site-pipeline"
                }
            ]
        }
        ```

*   **Rol de CodeBuild (`codebuild-astro-service-role`):**
    *   Política de confianza para `codebuild.amazonaws.com`.
    *   Permisos básicos de logs.
    *   Permiso en línea para S3 y CloudFront:
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:PutObject",
                        "s3:GetObject",
                        "s3:DeleteObject",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        "arn:aws:s3:::dev.topgolf.com.mx",
                        "arn:aws:s3:::dev.topgolf.com.mx/*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": "cloudfront:CreateInvalidation",
                    "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/TU_DISTRIBUTION_ID"
                }
            ]
        }
        ```

Con esta configuración, tu proyecto Jamstack está completamente automatizado en una infraestructura segura, escalable y de alto rendimiento.
