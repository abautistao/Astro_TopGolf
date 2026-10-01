import type { APIRoute } from 'astro';

const getRobotsTxt = (sitemapURL: URL) => `\
User-agent: *
Allow: /

# --- BOTS DE BÚSQUEDA Y CITAS DE IA EN TIEMPO REAL ---

# OpenAI (ChatGPT / SearchGPT búsqueda en vivo)
User-agent: OAI-SearchBot
Allow: /

# OpenAI (Navegación general de usuarios de ChatGPT)
User-agent: ChatGPT-User
Allow: /

# Perplexity AI (Motor de búsqueda de IA)
User-agent: PerplexityBot
Allow: /

# Google (Búsquedas y resúmenes de IA / Gemini)
User-agent: Google-Extended
Allow: /

# Claude / Anthropic (Respuestas y búsquedas)
User-agent: ClaudeBot
Allow: /

# DuckDuckGo AI (Respuestas con IA)
User-agent: DuckAssistBot
Allow: /


# --- BOTS DE ENTRENAMIENTO DE MODELOS DE IA ---

# OpenAI (Scraper de entrenamiento masivo)
User-agent: GPTBot
Allow: /

# Anthropic (Scraper de entrenamiento masivo)
User-agent: Anthropic-AI
Allow: /

# Apple (Entrenamiento de modelos de Apple Intelligence)
User-agent: Applebot-Extended
Allow: /

# Common Crawl (Dataset público consumido por múltiples IAs)
User-agent: CCBot
Allow: /

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
  });
};