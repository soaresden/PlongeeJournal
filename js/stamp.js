// ============================================================
//  Détourage d'un tampon photographié dans le carnet papier
//
//  Le problème : on photographie une page entière, le tampon
//  occupe un coin, la feuille est grise, l'éclairage inégal.
//
//  Pas besoin d'IA pour ça. Un tampon, c'est de l'encre sur du
//  papier : les pixels qui s'écartent nettement de la couleur
//  dominante (le papier) SONT le tampon. On procède donc ainsi :
//
//   1. estimer la couleur du papier (teinte la plus fréquente)
//   2. marquer les pixels « encrés » — ceux qui s'en écartent
//   3. projeter ces marques sur les lignes et les colonnes, et
//      garder la zone dense : c'est le cadre du tampon
//   4. recadrer, puis remettre le papier à blanc et l'encre à fond
//
//  Tout se fait dans le navigateur, sans réseau et sans service
//  tiers. Le résultat est proposé, jamais imposé : le cadre reste
//  déplaçable à la main.
// ============================================================

const MAX_ANALYSE = 900;     // on analyse une version réduite : plus rapide

/** Charge un fichier image en <img> décodée. */
export function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

function versCanvas(img, maxCote) {
  const ratio = Math.min(1, maxCote / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * ratio));
  cv.height = Math.max(1, Math.round(img.height * ratio));
  cv.getContext('2d', { willReadFrequently: true })
    .drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

/** Luminosité perçue, 0 (noir) à 255 (blanc). */
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Couleur du papier : le pic de l'histogramme dans les tons clairs.
 * On regarde la médiane haute plutôt que la moyenne, pour ne pas être
 * tiré vers le bas par un gros tampon.
 */
function couleurPapier(data) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    hist[Math.round(luma(data[i], data[i + 1], data[i + 2]))]++;
  }
  let pic = 0, max = 0;
  for (let v = 60; v < 256; v++) {        // on ignore les noirs francs
    if (hist[v] > max) { max = hist[v]; pic = v; }
  }
  return pic || 220;
}

/**
 * Détecte le rectangle du tampon.
 * @returns {{x:number, y:number, w:number, h:number, confiance:number}}
 *          en proportions de l'image (0 à 1)
 */
export function detecterCadre(img) {
  const cv = versCanvas(img, MAX_ANALYSE);
  const { width: W, height: H } = cv;
  const data = cv.getContext('2d', { willReadFrequently: true })
                 .getImageData(0, 0, W, H).data;

  const papier = couleurPapier(data);
  // Seuil : un pixel est « encré » s'il est nettement plus sombre que le
  // papier, ou nettement coloré (tampons bleus, violets, rouges).
  const seuilSombre = Math.max(28, papier * 0.22);

  const parLigne = new Uint32Array(H);
  const parColonne = new Uint32Array(W);
  let total = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = luma(r, g, b);
      const sature = Math.max(r, g, b) - Math.min(r, g, b);
      if (papier - l > seuilSombre || sature > 55) {
        parLigne[y]++; parColonne[x]++; total++;
      }
    }
  }

  // Trop peu d'encre : la photo est probablement vide ou surexposée.
  if (total < W * H * 0.002) {
    return { x: 0, y: 0, w: 1, h: 1, confiance: 0 };
  }

  // On garde les lignes/colonnes qui portent au moins 12 % du maximum :
  // cela élimine les lignes de la page et le bruit du papier.
  const bornes = (proj, taille) => {
    const max = Math.max(...proj);
    const seuil = Math.max(2, max * 0.12);
    let debut = 0, fin = taille - 1;
    while (debut < taille && proj[debut] < seuil) debut++;
    while (fin > debut && proj[fin] < seuil) fin--;
    return [debut, fin];
  };

  let [y0, y1] = bornes(parLigne, H);
  let [x0, x1] = bornes(parColonne, W);

  // Marge de respiration, puis on ramène dans l'image.
  const margeX = Math.round((x1 - x0) * 0.06) + 4;
  const margeY = Math.round((y1 - y0) * 0.06) + 4;
  x0 = Math.max(0, x0 - margeX); x1 = Math.min(W - 1, x1 + margeX);
  y0 = Math.max(0, y0 - margeY); y1 = Math.min(H - 1, y1 + margeY);

  const largeur = (x1 - x0 + 1) / W;
  const hauteur = (y1 - y0 + 1) / H;

  // Un cadre qui couvre presque toute la photo n'a rien détecté d'utile.
  const confiance = (largeur > 0.97 && hauteur > 0.97) ? 0.2
                  : Math.min(1, 0.4 + (1 - largeur * hauteur));

  return { x: x0 / W, y: y0 / H, w: largeur, h: hauteur, confiance };
}

/**
 * Recadre et nettoie : papier ramené au blanc, encre renforcée.
 * @param {HTMLImageElement} img
 * @param {object} cadre     proportions {x,y,w,h}
 * @param {object} options   { nettoyer, taille }
 * @returns {string} data-URL JPEG
 */
export function decouper(img, cadre, { nettoyer = true, taille = 800 } = {}) {
  const sx = Math.round(cadre.x * img.width);
  const sy = Math.round(cadre.y * img.height);
  const sw = Math.max(1, Math.round(cadre.w * img.width));
  const sh = Math.max(1, Math.round(cadre.h * img.height));

  const ratio = Math.min(1, taille / Math.max(sw, sh));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(sw * ratio));
  cv.height = Math.max(1, Math.round(sh * ratio));

  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);

  if (nettoyer) {
    const image = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = image.data;
    const papier = couleurPapier(d);

    // Étalement du contraste : tout ce qui est au-dessus du papier devient
    // blanc, le reste est étiré vers le noir. Le tampon ressort net, la
    // feuille disparaît — c'est ce qui rend l'image lisible en vignette.
    const bas = Math.max(0, papier * 0.35);
    const haut = Math.max(bas + 1, papier * 0.97);

    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c];
        d[i + c] = v <= bas ? 0
                 : v >= haut ? 255
                 : Math.round((v - bas) / (haut - bas) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  return cv.toDataURL('image/jpeg', 0.9);
}

/** Chaîne complète : fichier → cadre proposé → image détourée. */
export async function traiterFichier(fichier) {
  const img = await chargerImage(fichier);
  const cadre = detecterCadre(img);
  return { img, cadre, apercu: decouper(img, cadre) };
}
