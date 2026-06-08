import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

/**
 * Helper: convert a UTC date to Argentina local time (UTC-3) in ISO 8601 format
 * Returns format: 2024-06-15T21:00:00 (no offset, treated as local time of event location)
 * Google AI Overview interprets -03:00 incorrectly, so we omit the offset
 * and rely on the event's location (addressCountry: AR) for timezone context.
 */
function toArgentinaISO(dateStr) {
  const date = new Date(dateStr);
  // Argentina is always UTC-3 (no DST)
  const offset = -3 * 60; // -180 minutes
  const local = new Date(date.getTime() + offset * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

/**
 * GET /api/seo/show/:id
 * Returns JSON-LD structured data for a show (Schema.org Event)
 * This is consumed by the frontend to inject into the page for Google
 */
router.get('/show/:id', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;

    const show = await Show.findByPk(req.params.id);
    if (!show) {
      return res.status(404).json({ error: 'not_found' });
    }

    const sessions = await Session.findAll({
      where: { show_id: show.id },
      order: [['starts_at', 'ASC']]
    });

    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.teatropigue.com.ar';

    const venueLabelMap = {
      sala_principal: 'Sala Principal',
      el_tablado: 'El Tablado',
      las_gemelas: 'Nueva Sala'
    };

    // Build image URL
    let imageUrl = null;
    if (show.image_url) {
      if (show.image_url.startsWith('http')) {
        imageUrl = show.image_url;
      } else {
        const apiUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://www.teatropigue.com.ar';
        imageUrl = `${apiUrl}${show.image_url}`;
      }
    }

    // Get pricing
    let pricing = show.pricing_json;
    if (typeof pricing === 'string') {
      try { pricing = JSON.parse(pricing); } catch { pricing = null; }
    }
    
    // If single session, generate one Event; if multiple, generate EventSeries with sub-events
    if (sessions.length === 0) {
      return res.json({ jsonLd: null });
    }

    const events = sessions.map(session => {
      // Get session-specific pricing or fall back to show pricing
      let sessionPricing = session.pricing_json;
      if (typeof sessionPricing === 'string') {
        try { sessionPricing = JSON.parse(sessionPricing); } catch { sessionPricing = null; }
      }
      const effectivePricing = sessionPricing || pricing;
      
      // Calculate min/max price
      let minPrice = null;
      let maxPrice = null;
      if (effectivePricing && typeof effectivePricing === 'object') {
        const prices = Object.values(effectivePricing).filter(p => typeof p === 'number' && p > 0);
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        }
      }

      const event = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': show.title,
        'startDate': toArgentinaISO(session.starts_at),
        'endDate': toArgentinaISO(session.ends_at),
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': {
          '@type': 'Place',
          'name': `Teatro Español Pigüé - ${venueLabelMap[show.venue_type] || 'Sala Principal'}`,
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': 'España 120',
            'addressLocality': 'Pigüé',
            'addressRegion': 'Buenos Aires',
            'postalCode': '8170',
            'addressCountry': 'AR'
          }
        },
        'organizer': {
          '@type': 'Organization',
          'name': 'Teatro Español Pigüé',
          'url': baseUrl
        },
        'url': `${baseUrl}/cartelera/${show.id}`
      };

      if (show.description) {
        event.description = show.description;
      }

      if (imageUrl) {
        event.image = imageUrl;
      }

      if (minPrice !== null) {
        event.offers = {
          '@type': 'AggregateOffer',
          'lowPrice': minPrice,
          'highPrice': maxPrice,
          'priceCurrency': 'ARS',
          'availability': 'https://schema.org/InStock',
          'url': `${baseUrl}/detalle/${show.id}`
        };
      }

      return event;
    });

    // Return array if multiple sessions, single object if one
    const jsonLd = events.length === 1 ? events[0] : events;
    res.json({ jsonLd });
  } catch (error) {
    console.error('[SEO] Error generating JSON-LD:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/seo/sitemap
 * Returns a simple JSON sitemap of active shows for search engines
 */
router.get('/sitemap', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;
    
    const shows = await Show.findAll({
      where: { is_visible: true }
    });

    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.teatropigue.com.ar';
    
    const urls = [
      { url: baseUrl, changefreq: 'daily', priority: 1.0 },
      { url: `${baseUrl}/cartelera`, changefreq: 'daily', priority: 0.9 },
      { url: `${baseUrl}/agenda`, changefreq: 'daily', priority: 0.9 },
      { url: `${baseUrl}/conocenos`, changefreq: 'monthly', priority: 0.7 },
      { url: `${baseUrl}/salas`, changefreq: 'monthly', priority: 0.7 },
      { url: `${baseUrl}/ateneo`, changefreq: 'weekly', priority: 0.7 },
      { url: `${baseUrl}/ateneo/sobre`, changefreq: 'monthly', priority: 0.6 },
      { url: `${baseUrl}/apoyanos`, changefreq: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/trabaja-con-nosotros`, changefreq: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/centro-de-ayuda`, changefreq: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/contacto`, changefreq: 'monthly', priority: 0.6 },
      { url: `${baseUrl}/accesibilidad/cupo-discapacidad`, changefreq: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/accesibilidad/hipoacusicos`, changefreq: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/accesibilidad/historias-en-braile`, changefreq: 'monthly', priority: 0.5 }
    ];

    for (const show of shows) {
      const sessions = await Session.findAll({
        where: { show_id: show.id },
        order: [['starts_at', 'ASC']]
      });
      
      const hasFutureSessions = sessions.some(s => new Date(s.starts_at) > new Date());
      if (hasFutureSessions) {
        urls.push({
          url: `${baseUrl}/cartelera/${show.id}`,
          changefreq: 'weekly',
          priority: 0.8
        });
      }
    }

    // Generate XML sitemap with lastmod for cache invalidation
    const lastmod = new Date().toISOString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('[SEO] Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * GET /api/seo/prerender/:showId
 * Serves a full HTML page with embedded JSON-LD for Google bot pre-rendering
 * This is the key endpoint for fixing the timezone issue in Google results
 */
router.get('/prerender/:showId', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;

    const show = await Show.findByPk(req.params.showId);
    if (!show) {
      return res.status(404).send('Not found');
    }

    const sessions = await Session.findAll({
      where: { show_id: show.id },
      order: [['starts_at', 'ASC']]
    });

    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.teatropigue.com.ar';

    // Build JSON-LD
    const venueLabelMap = {
      sala_principal: 'Sala Principal',
      el_tablado: 'El Tablado',
      las_gemelas: 'Nueva Sala'
    };

    let imageUrl = null;
    if (show.image_url) {
      if (show.image_url.startsWith('http')) {
        imageUrl = show.image_url;
      } else {
        imageUrl = `${baseUrl}${show.image_url}`;
      }
    }

    let pricing = show.pricing_json;
    if (typeof pricing === 'string') {
      try { pricing = JSON.parse(pricing); } catch { pricing = null; }
    }

    const events = sessions.map(session => {
      let sessionPricing = session.pricing_json;
      if (typeof sessionPricing === 'string') {
        try { sessionPricing = JSON.parse(sessionPricing); } catch { sessionPricing = null; }
      }
      const effectivePricing = sessionPricing || pricing;
      
      let minPrice = null;
      let maxPrice = null;
      if (effectivePricing && typeof effectivePricing === 'object') {
        const prices = Object.values(effectivePricing).filter(p => typeof p === 'number' && p > 0);
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        }
      }

      const event = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': show.title,
        'startDate': toArgentinaISO(session.starts_at),
        'endDate': toArgentinaISO(session.ends_at),
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': {
          '@type': 'Place',
          'name': `Teatro Español Pigüé - ${venueLabelMap[show.venue_type] || 'Sala Principal'}`,
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': 'España 120',
            'addressLocality': 'Pigüé',
            'addressRegion': 'Buenos Aires',
            'postalCode': '8170',
            'addressCountry': 'AR'
          }
        },
        'organizer': {
          '@type': 'Organization',
          'name': 'Teatro Español Pigüé',
          'url': baseUrl
        },
        'url': `${baseUrl}/cartelera/${show.id}`
      };

      if (show.description) event.description = show.description;
      if (imageUrl) event.image = imageUrl;
      if (minPrice !== null) {
        event.offers = {
          '@type': 'AggregateOffer',
          'lowPrice': minPrice,
          'highPrice': maxPrice,
          'priceCurrency': 'ARS',
          'availability': 'https://schema.org/InStock',
          'url': `${baseUrl}/detalle/${show.id}`
        };
      }

      return event;
    });

    const jsonLdScript = events.length > 0 
      ? `<script type="application/ld+json">${JSON.stringify(events.length === 1 ? events[0] : events)}</script>`
      : '';

    // Format sessions for display
    const sessionsHtml = sessions.map(s => {
      const d = new Date(s.starts_at);
      const argDate = new Date(d.getTime() - 3 * 60 * 60000);
      const dateStr = argDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const timeStr = argDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
      return `<li>${dateStr} - ${timeStr} hs</li>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${show.title} - Teatro Español Pigüé</title>
  <meta name="description" content="${show.description || `${show.title} en Teatro Español Pigüé, España 120, Pigüé, Buenos Aires.`}">
  <link rel="canonical" href="${baseUrl}/cartelera/${show.id}">
  ${jsonLdScript}
</head>
<body>
  <h1>${show.title}</h1>
  <p>Teatro Español Pigüé - ${venueLabelMap[show.venue_type] || 'Sala Principal'}</p>
  ${show.description ? `<p>${show.description}</p>` : ''}
  <h2>Funciones</h2>
  <ul>${sessionsHtml}</ul>
  <p><a href="${baseUrl}/cartelera/${show.id}">Ver más información y comprar entradas</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('[SEO] Error prerendering:', error);
    res.status(500).send('Error');
  }
});

/**
 * GET /api/seo/bot-cartelera
 * Serves a full prerendered HTML page with all active shows for bots/crawlers
 * This is what Google/ChatGPT will see when they crawl the site
 */
router.get('/bot-cartelera', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;

    const shows = await Show.findAll({
      where: { is_visible: true },
      order: [['created_at', 'DESC']]
    });

    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.teatropigue.com.ar';

    const venueLabelMap = {
      sala_principal: 'Sala Principal',
      el_tablado: 'El Tablado',
      las_gemelas: 'Nueva Sala'
    };

    const allEvents = [];
    const showsHtml = [];

    for (const show of shows) {
      const sessions = await Session.findAll({
        where: { show_id: show.id },
        order: [['starts_at', 'ASC']]
      });

      const futureSessions = sessions.filter(s => new Date(s.starts_at) > new Date());
      if (futureSessions.length === 0) continue;

      let imageUrl = null;
      if (show.image_url) {
        imageUrl = show.image_url.startsWith('http') ? show.image_url : `${baseUrl}${show.image_url}`;
      }

      let pricing = show.pricing_json;
      if (typeof pricing === 'string') {
        try { pricing = JSON.parse(pricing); } catch { pricing = null; }
      }

      const sessionsHtml = futureSessions.map(s => {
        const d = new Date(s.starts_at);
        const argDate = new Date(d.getTime() - 3 * 60 * 60000);
        const dateStr = argDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        const timeStr = argDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
        const isoDatetime = toArgentinaISO(s.starts_at);
        return `<li><time datetime="${isoDatetime}">${dateStr} - ${timeStr} h</time> (Puertas abiertas 30 min antes)</li>`;
      }).join('');

      showsHtml.push(`
        <article>
          <h2><a href="${baseUrl}/cartelera/${show.id}">${show.title}</a></h2>
          <p><strong>Sala:</strong> ${venueLabelMap[show.venue_type] || 'Sala Principal'}</p>
          ${show.description ? `<p>${show.description}</p>` : ''}
          <h3>Próximas funciones:</h3>
          <ul>${sessionsHtml}</ul>
          <p><a href="${baseUrl}/detalle/${show.id}">Comprar entradas</a></p>
        </article>
      `);

      for (const session of futureSessions) {
        let sessionPricing = session.pricing_json;
        if (typeof sessionPricing === 'string') {
          try { sessionPricing = JSON.parse(sessionPricing); } catch { sessionPricing = null; }
        }
        const effectivePricing = sessionPricing || pricing;
        let minPrice = null, maxPrice = null;
        if (effectivePricing && typeof effectivePricing === 'object') {
          const prices = Object.values(effectivePricing).filter(p => typeof p === 'number' && p > 0);
          if (prices.length > 0) { minPrice = Math.min(...prices); maxPrice = Math.max(...prices); }
        }

        const event = {
          '@context': 'https://schema.org',
          '@type': 'Event',
          'name': show.title,
          'startDate': toArgentinaISO(session.starts_at),
          'endDate': toArgentinaISO(session.ends_at),
          'eventStatus': 'https://schema.org/EventScheduled',
          'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
          'location': {
            '@type': 'Place',
            'name': `Teatro Español Pigüé - ${venueLabelMap[show.venue_type] || 'Sala Principal'}`,
            'address': { '@type': 'PostalAddress', 'streetAddress': 'España 120', 'addressLocality': 'Pigüé', 'addressRegion': 'Buenos Aires', 'postalCode': '8170', 'addressCountry': 'AR' }
          },
          'organizer': { '@type': 'Organization', 'name': 'Teatro Español Pigüé', 'url': baseUrl },
          'url': `${baseUrl}/cartelera/${show.id}`
        };
        if (show.description) event.description = show.description;
        if (imageUrl) event.image = imageUrl;
        if (minPrice !== null) {
          event.offers = { '@type': 'AggregateOffer', 'lowPrice': minPrice, 'highPrice': maxPrice, 'priceCurrency': 'ARS', 'availability': 'https://schema.org/InStock', 'url': `${baseUrl}/detalle/${show.id}` };
        }
        allEvents.push(event);
      }
    }

    const jsonLdScript = allEvents.length > 0
      ? `<script type="application/ld+json">${JSON.stringify(allEvents)}</script>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cartelera - Teatro Español Pigüé</title>
  <meta name="description" content="Cartelera con todos los espectáculos del teatro. Conseguí tus entradas online en cualquier momento. Inscripciones en el Ateneo, formación en artes escénicas. ¡Te esperamos!">
  <link rel="canonical" href="${baseUrl}/cartelera">
  ${jsonLdScript}
</head>
<body>
  <h1>Cartelera - Teatro Español Pigüé</h1>
  <p>España 120, Pigüé, Buenos Aires, Argentina</p>
  <p>Conseguí tus entradas online en cualquier momento.</p>
  ${showsHtml.length > 0 ? showsHtml.join('\n') : '<p>No hay funciones programadas próximamente.</p>'}
  <footer>
    <p><a href="${baseUrl}">Teatro Español Pigüé</a> - España 120, Pigüé (8170), Buenos Aires, Argentina</p>
  </footer>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('[SEO] Error bot-cartelera:', error);
    res.status(500).send('Error');
  }
});

export default router;
