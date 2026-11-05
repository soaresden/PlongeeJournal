// ============================================================
//  Les numéros de secours, par pays
//
//  Le 112 répond dans toute l'Europe (et redirige depuis un portable
//  dans beaucoup d'autres pays). On n'écrit ici que des numéros sûrs ;
//  la page rappelle de vérifier sur place. Hors ligne : rien à charger.
// ============================================================

/** La ligne d'urgence de DAN Europe : accidents de plongée, 24 h/24, partout. */
export const DAN_EUROPE = { num: '+39 06 4211 8685', libelle: 'DAN Europe — accident de plongée, 24 h/24, depuis n’importe quel pays' };

/**
 * Par pays : drapeau, nom, numéros, et des repères (villes, spots)
 * pour deviner le pays d'après le GPS du téléphone.
 */
export const PAYS = [
  { id: 'FR', nom: 'France (et outre-mer)', drapeau: '🇫🇷', points: [[48.86,2.35], [45.76,4.84], [43.3,5.37], [43.7,7.27], [43.42,6.76], [44.84,-0.58], [48.39,-4.49], [49.64,-1.62], [50.63,3.06], [48.57,7.75], [43.6,1.44], [41.93,8.74], [42.7,9.45], [41.39,9.16], [41.59,9.28], [42.7,2.9], [42.53,3.08], [43.61,3.88], [43.12,5.93], [47.22,-1.55], [46.16,-1.15], [43.48,-1.56], [14.6,-61.07], [14.74,-61.17], [16.24,-61.53], [-20.88,55.45], [-21.33,55.47]],
    numeros: [['112', 'Urgences'], ['15', 'SAMU (urgence médicale)'], ['196', 'Secours en mer (CROSS)'], ['18', 'Pompiers']] },
  { id: 'ES', nom: 'Espagne (et Canaries)', drapeau: '🇪🇸', points: [[40.42,-3.7], [41.39,2.17], [42.29,3.28], [41.98,2.82], [42.04,3.2], [39.47,-0.38], [36.72,-4.42], [43.26,-2.93], [39.57,2.65], [39.89,4.26], [40.05,4.12], [38.91,1.43], [28.12,-15.43], [27.76,-15.57], [28.47,-16.25], [28.96,-13.55], [29.0,-13.85], [37.38,-5.98], [42.88,-8.54]],
    numeros: [['112', 'Urgences'], ['900 202 202', 'Sauvetage en mer (Salvamento Marítimo)']] },
  { id: 'PT', nom: 'Portugal (Açores, Madère)', drapeau: '🇵🇹', points: [[38.72,-9.14], [41.15,-8.61], [37.02,-7.93], [37.74,-25.67], [38.53,-28.63], [38.65,-27.22], [32.65,-16.91], [33.06,-16.33]],
    numeros: [['112', 'Urgences']] },
  { id: 'IT', nom: 'Italie', drapeau: '🇮🇹', points: [[41.9,12.5], [45.46,9.19], [40.85,14.27], [38.12,13.36], [39.22,9.12], [44.41,8.93], [45.44,12.33], [41.13,16.87], [37.5,15.09], [42.76,10.24], [40.55,14.24], [41.21,9.4]],
    numeros: [['112', 'Urgences'], ['118', 'Urgence médicale'], ['1530', 'Garde-côtes (secours en mer)']] },
  { id: 'GR', nom: 'Grèce', drapeau: '🇬🇷', points: [[37.98,23.73], [40.64,22.94], [39.62,19.92], [39.79,19.92], [39.45,20.02], [35.34,25.13], [36.43,28.22], [38.25,21.73], [37.08,25.15], [36.4,25.46], [38.8,20.71]],
    numeros: [['112', 'Urgences'], ['166', 'Ambulance (EKAB)'], ['108', 'Garde-côtes']] },
  { id: 'MT', nom: 'Malte', drapeau: '🇲🇹', points: [[35.9,14.51], [36.04,14.25], [35.95,14.4]],
    numeros: [['112', 'Urgences (ambulance, secours en mer)']] },
  { id: 'HR', nom: 'Croatie', drapeau: '🇭🇷', points: [[45.81,15.98], [43.51,16.44], [42.65,18.09], [44.87,13.85], [44.12,15.23]],
    numeros: [['112', 'Urgences'], ['194', 'Ambulance'], ['195', 'Secours en mer']] },
  { id: 'BE', nom: 'Belgique', drapeau: '🇧🇪', points: [[50.85,4.35], [50.63,5.57], [51.05,3.72], [51.22,4.4], [50.47,4.87]],
    numeros: [['112', 'Urgences']] },
  { id: 'AL', nom: 'Albanie', drapeau: '🇦🇱', points: [[41.33,19.82], [41.32,19.45], [40.47,19.49], [40.1,19.74], [39.875,20.005], [40.03,19.95]],
    numeros: [['127', 'Ambulance'], ['129', 'Police']] },
  { id: 'EG', nom: 'Égypte', drapeau: '🇪🇬', points: [[30.04,31.24], [27.26,33.81], [27.92,34.33], [25.07,34.89], [28.49,34.51], [31.2,29.92]],
    numeros: [['123', 'Ambulance'], ['122', 'Police']] },
  { id: 'CV', nom: 'Cap-Vert', drapeau: '🇨🇻', points: [[16.74,-22.94], [16.59,-22.9], [14.93,-23.51], [16.89,-24.98], [16.1,-22.8]],
    numeros: [['130', 'Urgence médicale'], ['132', 'Police']] },
  { id: 'GB', nom: 'Royaume-Uni', drapeau: '🇬🇧', points: [[51.51,-0.13], [53.48,-2.24], [50.38,-4.14], [55.95,-3.19], [54.6,-5.93], [50.72,-1.88]],
    numeros: [['999', 'Urgences (demander « Coastguard » en mer)'], ['112', 'Urgences']] },
  { id: 'US', nom: 'États-Unis', drapeau: '🇺🇸', points: [[40.71,-74.01], [25.76,-80.19], [24.56,-81.78], [34.05,-118.24], [21.31,-157.86], [29.76,-95.37], [47.61,-122.33]],
    numeros: [['911', 'Urgences']] },
  { id: 'AUTRE', nom: 'Autre pays', drapeau: '🌍', points: [],
    numeros: [['112', 'Urgences : marche depuis un portable dans beaucoup de pays']] },
];

const rad = x => x * Math.PI / 180;
const km = (a, b, c, d) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2
  + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));

/** Le pays d'après une position GPS : celui du repère le plus proche (à 500 km au plus). */
export function paysDe(lat, lng) {
  let meilleur = null;
  let dist = 500;
  for (const p of PAYS) {
    for (const [a, b] of p.points) {
      const d = km(lat, lng, a, b);
      if (d < dist) { dist = d; meilleur = p; }
    }
  }
  return meilleur;
}
