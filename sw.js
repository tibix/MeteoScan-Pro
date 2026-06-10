// MétéoScan Pro — Service Worker V3.8
// Notifications push locales

const CACHE_NAME = 'meteoscan-v3.8';

// Installation
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Réception des messages depuis l'appli principale
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_ALERTS') {
    checkAndNotify(e.data.payload);
  }
});

// Vérifier les alertes et envoyer des notifications si nécessaire
async function checkAndNotify(data) {
  if (!data) return;

  const lang = data.lang || 'fr';
  const city = data.city || '';
  const alerts = [];

  const TEXTS = {
    fr: {
      ith_sev:   '🐄 Stress thermique sévère',
      ith_mod:   '🐄 Stress thermique modéré',
      gel:       '❄️ Risque de gel',
      canicule:  '🌡️ Canicule',
      tempete:   '🌪️ Tempête',
      orage:     '⛈️ Épisode orageux',
      body_ith_sev: 'ITH ≥ 90 prévu. Voir onglet Élevage.',
      body_ith_mod: 'ITH 80-89 prévu. Voir onglet Élevage.',
      body_gel:     'Températures négatives prévues. Protégez vos cultures.',
      body_canicule:'Températures ≥ 35°C prévues.',
      body_tempete: 'Vents violents prévus.',
      body_orage:   'Orages répétés prévus.',
    },
    en: {
      ith_sev:   '🐄 Severe heat stress',
      ith_mod:   '🐄 Moderate heat stress',
      gel:       '❄️ Frost risk',
      canicule:  '🌡️ Heat wave',
      tempete:   '🌪️ Storm',
      orage:     '⛈️ Storm episode',
      body_ith_sev: 'THI ≥ 90 forecast. See Livestock tab.',
      body_ith_mod: 'THI 80-89 forecast. See Livestock tab.',
      body_gel:     'Sub-zero temperatures forecast. Protect your crops.',
      body_canicule:'Temperatures ≥ 35°C forecast.',
      body_tempete: 'Violent winds forecast.',
      body_orage:   'Repeated storms forecast.',
    },
    es: {
      ith_sev:   '🐄 Estrés térmico severo',
      ith_mod:   '🐄 Estrés térmico moderado',
      gel:       '❄️ Riesgo de helada',
      canicule:  '🌡️ Ola de calor',
      tempete:   '🌪️ Tormenta violenta',
      orage:     '⛈️ Episodio tormentoso',
      body_ith_sev: 'ITH ≥ 90 previsto. Ver pestaña Ganadería.',
      body_ith_mod: 'ITH 80-89 previsto. Ver pestaña Ganadería.',
      body_gel:     'Temperaturas negativas previstas. Proteja sus cultivos.',
      body_canicule:'Temperaturas ≥ 35°C previstas.',
      body_tempete: 'Vientos violentos previstos.',
      body_orage:   'Tormentas repetidas previstas.',
    }
  };

  const T = TEXTS[lang] || TEXTS.fr;

  // ITH stress thermique
  if (data.tmax_7d && data.hum_7d) {
    const ithValues = data.tmax_7d.map((tm, i) => {
      const hr = data.hum_7d[i] || 60;
      return Math.round(0.8 * tm + (hr / 100) * (tm - 14.4) + 46.4);
    });
    const joursSev = ithValues.filter(v => v >= 90).length;
    const joursMod = ithValues.filter(v => v >= 80 && v < 90).length;
    const ithMax = Math.max(...ithValues);

    if (joursSev >= 1) {
      alerts.push({ title: T.ith_sev, body: T.body_ith_sev + ` (ITH max ${ithMax})`, tag: 'ith-sev', urgency: 3 });
    } else if (joursMod >= 2) {
      alerts.push({ title: T.ith_mod, body: T.body_ith_mod + ` (ITH max ${ithMax})`, tag: 'ith-mod', urgency: 2 });
    }
  }

  // Gel
  if (data.tmin_5d) {
    const minT = Math.min(...data.tmin_5d);
    if (minT <= 0) {
      alerts.push({ title: T.gel, body: T.body_gel + ` (min ${Math.round(minT)}°C)`, tag: 'gel', urgency: 3 });
    }
  }

  // Canicule
  if (data.tmax_7d) {
    const maxT = Math.max(...data.tmax_7d.slice(0, 5));
    if (maxT >= 35) {
      alerts.push({ title: T.canicule, body: T.body_canicule + ` (max ${Math.round(maxT)}°C)`, tag: 'canicule', urgency: 2 });
    }
  }

  // Tempête
  if (data.wind_7d) {
    const maxWind = Math.max(...data.wind_7d.slice(0, 5));
    if (maxWind >= 60) {
      alerts.push({ title: T.tempete, body: T.body_tempete + ` (${Math.round(maxWind)} km/h)`, tag: 'tempete', urgency: 3 });
    }
  }

  // Orage
  if (data.weather_codes) {
    const joursOrage = data.weather_codes.slice(0, 7).filter(c => c >= 95).length;
    if (joursOrage >= 2) {
      alerts.push({ title: T.orage, body: T.body_orage + ` (${joursOrage}j)`, tag: 'orage', urgency: 2 });
    }
  }

  // Envoyer uniquement l'alerte la plus urgente pour ne pas spammer
  if (alerts.length === 0) return;
  alerts.sort((a, b) => b.urgency - a.urgency);
  const top = alerts[0];

  // Vérifier si déjà notifié aujourd'hui pour cette alerte
  const cache = await caches.open(CACHE_NAME);
  const today = new Date().toISOString().slice(0, 10);
  const notifKey = `/notif-${top.tag}-${today}`;
  const already = await cache.match(notifKey);
  if (already) return; // Déjà notifié aujourd'hui

  // Marquer comme notifié
  await cache.put(notifKey, new Response('1'));

  // Envoyer la notification
  await self.registration.showNotification(`MétéoScan Pro — ${city}`, {
    body: `${top.title}\n${top.body}`,
    icon: '/MeteoScan-Pro/logo.png',
    badge: '/MeteoScan-Pro/logo.png',
    tag: top.tag,
    requireInteraction: top.urgency >= 3,
    vibrate: top.urgency >= 3 ? [200, 100, 200] : [100],
    data: { url: '/MeteoScan-Pro/' }
  });
}

// Clic sur la notification → ouvrir l'appli
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('MeteoScan-Pro')) {
          return client.focus();
        }
      }
      return clients.openWindow('/MeteoScan-Pro/');
    })
  );
});
