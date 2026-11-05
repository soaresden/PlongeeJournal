// ============================================================
//  Suunto Ocean — session Bluetooth avec la montre
//
//  Ce module parle à la montre au travers d'un « lien » (voir ble.js),
//  qui ne sait qu'envoyer des octets et en recevoir. Il ne connaît ni
//  Web Bluetooth ni Capacitor : les tests le branchent sur une fausse
//  montre.
//
//  Déroulé d'un import :
//    1. bonjour (HELLO) ;
//    2. /Info : modèle, n° de série, logiciel ;
//    3. /Logbook/Entries : la liste des plongées (id = heure de début) ;
//    4. pour chaque plongée choisie : /Logbook/byId/<id>/Data en flux
//       (compressé Heatshrink), puis /Logbook/byId/<id>/Summary en pages.
//
//  Cohabitation avec l'appli Suunto : la montre sert toutes les applis
//  connectées sur le même lien. Les réponses destinées à l'autre appli
//  sont reconnues à leur n° de séquence et ignorées. Si l'appli Suunto
//  ouvre sa propre session pendant un téléchargement, la montre coupe
//  notre flux : on se met en retrait le temps qu'elle finisse, puis on
//  reprend là où on en était, par pages, sans redire bonjour (un
//  nouveau bonjour la ferait recommencer).
//
//  Portage du pilote suunto_nautic de libdivecomputer (LGPL 2.1+).
// ============================================================

import {
  OP, NOM_OP, STATUT, HELLO, HdlcDecoder, buildPacket, parsePacket, hdlcEncode,
  getPayload, handlePayload, pageParams, entriesParams, replyStatus, REPLY_CONTENT,
  parseEntriesPage, parsePage, parseChunk, parseInfo,
  handleSlot, handleRessource, SLOT_STATIQUE, SLOT_INCONNU, u24, hex,
} from './ocean-proto.js';
import { heatshrinkDecompress } from './heatshrink.js';

export const DELAIS = {
  reponse: 8000,          // une réponse à une requête
  flux: 4000,             // entre deux morceaux de flux (l'écart atteint ~2 s)
  bonjour: 3000,
  calmeAvant: 1500,       // silence attendu avant de dire bonjour
  calmeMax: 30000,
  retraitCalme: 5000,     // silence qui marque la fin de la synchro Suunto
  retraitMax: 300000,
};

export class DelaiDepasse extends Error {
  constructor(quoi) { super(`Pas de réponse de la montre (${quoi})`); this.name = 'DelaiDepasse'; }
}
export class Annule extends Error {
  constructor() { super('Import annulé'); this.name = 'Annule'; }
}

const MAGIC = 'SBEM0103';
const aMagic = b => b.length >= 8 && String.fromCharCode(...b.subarray(0, 8)) === MAGIC;
const dormir = ms => new Promise(r => setTimeout(r, ms));

class Tampon {
  constructor() { this.parts = []; this.taille = 0; }
  ajouter(b) { if (b.length) { this.parts.push(b.slice()); this.taille += b.length; } }
  octets() {
    const out = new Uint8Array(this.taille);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

export class OceanSession {
  /**
   * @param {{ecrire:(b:Uint8Array)=>Promise<void>, ecouter:(cb:(b:Uint8Array)=>void)=>void}} lien
   * @param {{journal?:(t:string)=>void, signal?:AbortSignal, delais?:object, horloge?:()=>number}} [opts]
   */
  constructor(lien, { journal = () => {}, signal = null, delais = {}, horloge = () => Date.now() } = {}) {
    this.lien = lien;
    this.log = journal;
    this.signal = signal;
    this.delais = { ...DELAIS, ...delais };
    this.maintenant = horloge;
    this.seq = 1 + Math.floor(Math.random() * 0xFFFE);
    this.file = [];
    this.reveil = null;
    this.dernierTrafic = this.maintenant();
    this.stats = { trames: 0, rejetees: 0, ignorees: 0, octets: 0, conflits: 0 };
    this.decodeur = new HdlcDecoder(f => this._trame(f), {
      onError: e => { this.stats.rejetees++; this.log(`⚠ HDLC : ${e}`); },
    });
    signal?.addEventListener('abort', () => this.reveil?.());
    lien.ecouter(b => {
      this.stats.octets += b.length;
      this.dernierTrafic = this.maintenant();
      this.decodeur.push(b);
    });
  }

  // ---------- réception ----------

  _trame(f) {
    this.stats.trames++;
    const p = parsePacket(f);
    if (p.erreur) {
      this.stats.rejetees++;
      this.log(`⚠ trame rejetée : ${p.erreur}`);
      this._pousser({ erreur: p.erreur });
      return;
    }
    this._pousser(p);
  }

  _pousser(item) {
    this.file.push(item);
    const r = this.reveil;
    this.reveil = null;
    r?.();
  }

  _verifierAnnulation() {
    if (this.signal?.aborted) throw new Annule();
  }

  /** Le prochain paquet reçu, ou null passé le délai. */
  async _suivant(delaiMs) {
    if (this.file.length) return this.file.shift();
    let minuterie;
    await new Promise(r => {
      this.reveil = r;
      minuterie = setTimeout(r, Math.max(0, delaiMs));
    });
    clearTimeout(minuterie);
    this.reveil = null;
    this._verifierAnnulation();
    return this.file.length ? this.file.shift() : null;
  }

  /**
   * Attend un paquet accepté par `accepte`. Les autres passent par
   * `autre` (détection d'une autre appli) puis sont jetés. Le délai
   * est une échéance fixe : le trafic des autres ne la repousse pas.
   */
  async _recevoir(accepte, delaiMs, quoi, autre = null) {
    const echeance = this.maintenant() + delaiMs;
    while (true) {
      this._verifierAnnulation();
      const p = await this._suivant(echeance - this.maintenant());
      if (!p) throw new DelaiDepasse(quoi);
      if (!p.erreur && accepte(p)) return p;
      if (autre && autre(p) === 'stop') return null;
      if (!p.erreur) {
        this.stats.ignorees++;
        if (p.op !== OP.NOTIFICATION) this.log(`· ignoré ${NOM_OP[p.op] ?? p.op.toString(16)} n°${p.seq} (autre appli ?)`);
      }
    }
  }

  // ---------- envoi ----------

  _numero() {
    this.seq = (this.seq + 1) & 0xFFFF;
    if (this.seq === 0) this.seq = 1;    // 0 : bonjour et notifications
    return this.seq;
  }

  async _envoyer(op, seq, payload, note = '') {
    this._verifierAnnulation();
    const paquet = buildPacket(op, seq, payload);
    this.log(`→ ${NOM_OP[op]} n°${seq}${note ? ' ' + note : ''} [${hex(payload, 24)}]`);
    await this.lien.ecrire(hdlcEncode(paquet));
  }

  /** Requête + réponse appariée par opcode et n° de séquence. */
  async _requete(op, opReponse, payload, note) {
    const seq = this._numero();
    await this._envoyer(op, seq, payload, note);
    const p = await this._recevoir(x => x.op === opReponse && x.seq === seq, this.delais.reponse, `${NOM_OP[op]} ${note || ''}`.trim());
    const statut = replyStatus(p.payload);
    this.log(`← ${NOM_OP[p.op]} n°${p.seq} statut ${statut} (${p.payload.length} o)`);
    if (statut === null) throw new Error(`Réponse trop courte à ${NOM_OP[op]}`);
    return { payload: p.payload, statut, contenu: p.payload.subarray(REPLY_CONTENT) };
  }

  // ---------- opérations de base ----------

  /** Attend un silence (une autre appli est peut-être en pleine synchro). */
  async attendreCalme(calmeMs, maxMs) {
    const debut = this.maintenant();
    let prevenu = false;
    while (this.maintenant() - this.dernierTrafic < calmeMs) {
      this._verifierAnnulation();
      if (this.maintenant() - debut > maxMs) { this.log('· le lien ne se calme pas, on continue'); return false; }
      if (!prevenu) { this.log('· trafic d’une autre appli sur le lien : on attend qu’il se calme'); prevenu = true; }
      this.file.length = 0;
      await dormir(Math.min(250, calmeMs));
    }
    this.file.length = 0;
    return true;
  }

  async bonjour() {
    await dormir(this.delais.calmeAvant);
    await this.attendreCalme(this.delais.calmeAvant, this.delais.calmeMax);
    await this._envoyer(OP.HELLO, 0, HELLO);
    try {
      const p = await this._recevoir(x => x.op === OP.HELLO_REPLY, this.delais.bonjour, 'bonjour');
      this.log(`← HELLO_REPLY [${hex(p.payload, 32)}]`);
      return true;
    } catch (e) {
      if (!(e instanceof DelaiDepasse)) throw e;
      // Une montre en veille ne répond pas : on continue, la première
      // requête dira si elle est là.
      this.log('⚠ pas de réponse au bonjour (montre en veille ?), on continue');
      return false;
    }
  }

  async get(path) {
    const r = await this._requete(OP.GET, OP.GET_REPLY, getPayload(path), path);
    if (r.statut !== STATUT.OK) throw new Error(`La montre refuse ${path} (statut ${r.statut})`);
    const handle = u24(r.payload, 0);
    this.log(`  ${path} → handle ${handle.toString(16).padStart(6, '0')}`);
    return handle;
  }

  async liberer(handle) {
    const slot = handleSlot(handle);
    if (slot === SLOT_STATIQUE || slot === SLOT_INCONNU) return;
    const r = await this._requete(OP.RELEASE, OP.RELEASE_REPLY, handlePayload(handle, new Uint8Array(0)), handle.toString(16));
    if (r.statut !== STATUT.OK) this.log(`⚠ libération du handle ${handle.toString(16)} : statut ${r.statut}`);
  }

  /** Lit une ressource paginée à partir de `tampon.taille`. */
  async lirePages(handle, tampon, { quoi = 'pages', progres = null } = {}) {
    while (true) {
      const r = await this._requete(OP.FETCH, OP.DATA, handlePayload(handle, pageParams(tampon.taille)), `${quoi} @${tampon.taille}`);
      if (r.statut !== STATUT.OK && r.statut !== STATUT.SUITE) throw new Error(`${quoi} : statut ${r.statut}`);
      const page = parsePage(r.contenu);
      tampon.ajouter(page);
      progres?.(tampon.taille);
      if (r.statut === STATUT.OK) return tampon;
      if (!page.length) throw new Error(`${quoi} : page vide alors que la suite est annoncée`);
    }
  }

  async lireSimple(path) {
    const h = await this.get(path);
    try {
      const r = await this._requete(OP.FETCH, OP.DATA, handlePayload(h), path);
      if (r.statut !== STATUT.OK) throw new Error(`${path} : statut ${r.statut}`);
      return r.contenu.slice();
    } finally {
      await this.liberer(h).catch(e => this.log(`⚠ ${e.message}`));
    }
  }

  // ---------- haut niveau ----------

  async infos() {
    const brut = await this.lireSimple('/Info');
    const info = parseInfo(brut);
    this.log(`  montre : ${info.modele ?? '?'} · série ${info.serie ?? '?'} · logiciel ${info.logiciel ?? '?'}`);
    return { ...info, brut };
  }

  /** Les plongées de la montre, de la plus ancienne à la plus récente. */
  async lister() {
    const path = '/Logbook/Entries';
    const h = await this.get(path);
    const fiches = [];
    try {
      let apres = 0;
      for (let page = 0; page < 200; page++) {
        const r = await this._requete(OP.FETCH, OP.DATA, handlePayload(h, entriesParams(page ? apres : 0)), `${path} après ${apres}`);
        if (r.statut !== STATUT.OK && r.statut !== STATUT.SUITE) throw new Error(`${path} : statut ${r.statut}`);
        const lot = parseEntriesPage(r.contenu).fiches;
        fiches.push(...lot);
        const avant = apres;
        if (lot.length) apres = lot[lot.length - 1].id;
        if (r.statut === STATUT.OK) break;
        if (apres === avant) throw new Error(`${path} : la liste n’avance plus`);
      }
    } finally {
      await this.liberer(h).catch(e => this.log(`⚠ ${e.message}`));
    }
    this.log(`  ${fiches.length} plongée(s) dans la montre`);
    return fiches;
  }

  /**
   * Le flux compressé d'une plongée (/Data). Un morceau perdu, une
   * coupure ou l'appli Suunto qui prend la main : on finit par pages.
   */
  async lireFlux(path, { attendu = 0, progres = null } = {}) {
    const tampon = new Tampon();
    let h = await this.get(path);
    let conflit = false, trou = false, coupe = false;

    const sub = await this._requete(OP.SUBSCRIBE, OP.SUBSCRIBE_REPLY, handlePayload(h), path);
    if (sub.statut !== STATUT.OK) {
      // 423 : un flux précédent n'est pas refermé. On lit par pages.
      this.log(`⚠ flux refusé (statut ${sub.statut}) : lecture par pages`);
      try {
        await this.lirePages(h, tampon, { quoi: path, progres });
      } finally {
        await this.liberer(h).catch(e => this.log(`⚠ ${e.message}`));
      }
      return tampon.octets();
    }

    let morceaux = 0;
    const surAutre = p => {
      if (p.erreur) return null;          // trame abîmée : le contrôle d'offset dira s'il manque un morceau
      if (p.op === OP.HELLO_REPLY) {
        this.log('⚠ une autre appli vient de dire bonjour à la montre');
        conflit = true;
        return 'stop';
      }
      if (p.op === OP.UNSUBSCRIBE_REPLY && u24(p.payload, 0) === h && replyStatus(p.payload) !== STATUT.OK) {
        this.log(`⚠ la montre a coupé notre flux (statut ${replyStatus(p.payload)})`);
        conflit = true;
        return 'stop';
      }
      return null;
    };

    try {
      while (true) {
        let p;
        try {
          p = await this._recevoir(
            x => x.op === OP.NOTIFICATION && x.seq === 0 && x.payload.length >= 3
              && handleRessource(u24(x.payload, 0)) === handleRessource(h),
            this.delais.flux, `flux ${path}`, surAutre);
        } catch (e) {
          if (!(e instanceof DelaiDepasse)) throw e;
          this.log(`⚠ le flux s’est arrêté à ${tampon.taille} o`);
          coupe = true;
          break;
        }
        if (!p) break;                      // conflit
        const c = parseChunk(p.payload);
        if (c.offset > tampon.taille) {
          this.log(`⚠ morceau perdu : reçu @${c.offset}, attendu @${tampon.taille}`);
          trou = true;
          break;
        }
        if (c.offset < tampon.taille) {
          if (c.data.length === 0) continue;  // marque de fin répétée
          this.log(`· morceau en double @${c.offset} ignoré`);
          continue;
        }
        if (c.data.length === 0) break;     // fin du flux
        tampon.ajouter(c.data);
        morceaux++;
        if (morceaux % 50 === 1) this.log(`  flux : ${tampon.taille}${attendu ? ' / ' + attendu : ''} o`);
        progres?.(tampon.taille);
      }
    } finally {
      if (!conflit) {
        // Sans UNSUBSCRIBE la montre continue d'envoyer, et le flux suivant
        // est refusé (423).
        try {
          const r = await this._requete(OP.UNSUBSCRIBE, OP.UNSUBSCRIBE_REPLY, handlePayload(h), path);
          if (r.statut !== STATUT.OK) this.log(`⚠ désabonnement : statut ${r.statut}`);
        } catch (e) {
          this.log(`⚠ désabonnement : ${e.message}`);
        }
      }
    }

    if (conflit) {
      // L'appli Suunto synchronise : on lui laisse la place. Notre
      // abonnement et notre handle sont déjà tombés de son côté.
      this.stats.conflits++;
      this.log('⏸ l’appli Suunto synchronise la montre : pause jusqu’à ce qu’elle ait fini');
      await this.attendreCalme(this.delais.retraitCalme, this.delais.retraitMax);
      this.log(`▶ reprise de ${path} à l’octet ${tampon.taille}`);
      h = await this.get(path);
    }

    try {
      if (conflit || trou || coupe) {
        this.log(`  lecture par pages à partir de @${tampon.taille}`);
        await this.lirePages(h, tampon, { quoi: path, progres });
      }
    } finally {
      await this.liberer(h).catch(e => this.log(`⚠ ${e.message}`));
    }
    this.log(`  ${path} : ${tampon.taille} o compressés`);
    return tampon.octets();
  }

  async lireResume(id) {
    const path = `/Logbook/byId/${id}/Summary`;
    const h = await this.get(path);
    const tampon = new Tampon();
    try {
      await this.lirePages(h, tampon, { quoi: path });
    } finally {
      await this.liberer(h).catch(e => this.log(`⚠ ${e.message}`));
    }
    return tampon.octets();
  }

  /**
   * Une plongée complète : profil décompressé, puis /Summary accolé
   * (le décodeur y trouve gaz, gradients, profondeur de la montre).
   * Rend {sbem, compresse, resume}.
   */
  async telecharger(fiche, { progres = null } = {}) {
    const { id, taille } = fiche;
    let compresse, resume;
    for (let essai = 1; essai <= 2; essai++) {
      compresse = await this.lireFlux(`/Logbook/byId/${id}/Data`, { attendu: taille, progres });
      resume = await this.lireResume(id);
      if (!taille || compresse.length + resume.length === taille) break;
      this.log(`⚠ plongée ${id} incomplète : ${compresse.length} + ${resume.length} o, annoncé ${taille}`);
      if (essai === 2) throw new Error(`Plongée ${id} incomplète (${compresse.length + resume.length} o sur ${taille})`);
    }
    const profil = heatshrinkDecompress(compresse);
    if (!aMagic(profil)) throw new Error(`Plongée ${id} : données illisibles (pas de SBEM0103 en tête)`);
    const sbem = new Uint8Array(profil.length + resume.length);
    sbem.set(profil);
    sbem.set(resume, profil.length);
    this.log(`✓ plongée ${id} : ${profil.length} o décompressés + résumé ${resume.length} o`);
    return { sbem, compresse, resume };
  }
}
