-- ============================================================
--  Carnet de plongée — schéma Supabase
--
--  À coller tel quel dans : Supabase → SQL Editor → New query → Run
--  Le script est idempotent : on peut le rejouer sans casse.
--
--  Modèle : UN compte propriétaire (toi), qui possède plusieurs
--  identités de plongeur, chacune avec son carnet. Toutes les
--  tables sont protégées par RLS sur owner_id = auth.uid().
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Fonctions utilitaires
-- ------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Renseigne owner_id automatiquement à l'insertion.
create or replace function public.set_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id is null then
    new.owner_id = auth.uid();
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
--  1. Plongeurs (identités)
-- ------------------------------------------------------------

create table if not exists public.divers (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  prenom         text not null default '',
  nom            text not null default '',
  licence        text default '',
  niveau         text default '',
  nationalite    text default '',
  groupe_sanguin text default '',
  rue            text default '',
  cp             text default '',
  ville          text default '',
  pays           text default '',
  urg_prenom     text default '',
  urg_nom        text default '',
  urg_tel        text default '',
  urg_lien       text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Matériel personnel : saisi une fois, repris sur chaque plongée.
alter table public.divers add column if not exists materiel jsonb not null default '[]';
alter table public.divers add column if not exists combi_type text default '';
alter table public.divers add column if not exists combi_mm   text default '';

-- ------------------------------------------------------------
--  1 bis. Cartes et certifications
--
--  Le niveau courant se DÉDUIT des plongées (le plus haut saisi).
--  Ces cartes-là sont autre chose : des documents datés, avec un
--  numéro, qu'on veut pouvoir retrouver.
-- ------------------------------------------------------------

create table if not exists public.certifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  diver_id   uuid not null references public.divers(id) on delete cascade,
  nom        text not null default '',       -- N2, Nitrox, RIFAP…
  numero     text default '',
  organisme  text default '',                -- FFESSM, PADI, SSI…
  date_obtention date,
  photo_path text,                           -- recto de la carte, optionnel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists certifications_diver_idx
  on public.certifications(diver_id, date_obtention desc);

-- ------------------------------------------------------------
--  2. Compagnons
-- ------------------------------------------------------------

create table if not exists public.buddies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  prenom     text not null default '',
  nom        text not null default '',
  licence    text default '',       -- identifiant unique du plongeur (FFESSM…)
  club       text default '',       -- sert à regrouper la liste
  moniteur   boolean not null default false,  -- seule qualité durable
  niveau     text default '',       -- ancien champ, conservé pour l'historique
  note       text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rattrapage si la table existait déjà sans les colonnes.
alter table public.buddies add column if not exists licence  text default '';
alter table public.buddies add column if not exists club     text default '';
alter table public.buddies add column if not exists moniteur boolean not null default false;

-- Migration : « note » servait de club avant que la colonne existe.
-- On déplace l'information une seule fois, sans écraser un club déjà saisi.
update public.buddies
   set club = trim(note),
       note = ''
 where coalesce(trim(club), '') = ''
   and coalesce(trim(note), '') <> '';

-- Migration : le niveau d'un compagnon change avec le temps, il ne veut donc
-- rien dire figé sur une fiche. Seul « est-ce un moniteur » reste vrai.
-- Ce qui compte pour les statistiques, c'est TON niveau, sur chaque plongée.
update public.buddies
   set moniteur = true
 where moniteur = false
   and niveau ~* '(mf1|mf2|\me[1-4]\M|initiateur|monit|instruct)';

-- Un même numéro de licence ne peut désigner qu'un seul compagnon.
-- L'index ignore les fiches sans licence, qui restent donc possibles.
create unique index if not exists buddies_licence_unique
  on public.buddies(owner_id, licence)
  where licence is not null and licence <> '';

-- Tampons : l'image vit dans le bucket Storage « stamps »,
-- la table ne garde que son chemin.
create table if not exists public.buddy_stamps (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  buddy_id     uuid not null references public.buddies(id) on delete cascade,
  storage_path text not null,
  label        text default '',
  created_at   timestamptz not null default now()
);

create index if not exists buddy_stamps_buddy_idx on public.buddy_stamps(buddy_id);

-- ------------------------------------------------------------
--  3. Plongées
-- ------------------------------------------------------------

create table if not exists public.dives (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users(id) on delete cascade,
  diver_id  uuid not null references public.divers(id) on delete cascade,

  numero    integer,
  date      date,

  -- Lieu : le libellé cherché ET le point exact sont conservés séparément.
  lieu_nom    text default '',
  lieu_detail text default '',
  lat         double precision,
  lng         double precision,
  eau         text check (eau in ('douce', 'salee') or eau is null or eau = ''),
  site        text default '',

  heure_immersion time,
  heure_sortie    time,
  duree_min       integer,

  type           text default '',
  options        text[] not null default '{}',
  objectifs      text[] not null default '{}',
  objectif_autre text default '',
  -- Mémoire des étiquettes automatiques acceptées ou refusées à la main,
  -- pour qu'une suggestion écartée ne revienne jamais.
  options_refusees  text[] not null default '{}',
  options_manuelles text[] not null default '{}',

  palier3  integer,
  palier6  integer,
  palier9  integer,
  -- Le palier de sécurité n'est pas un palier de décompression :
  -- il est suivi à part et ne déclenche pas l'étiquette « Décompression ».
  palier_secu     boolean not null default false,
  palier_secu_min integer,
  prof_max numeric(5,2),
  prof_moy numeric(5,2),

  -- Niveau du plongeur CE JOUR-LÀ. C'est lui qui alimente les statistiques :
  -- un niveau figé sur la fiche du plongeur serait faux pour les plongées
  -- antérieures à son obtention.
  niveau   text default '',

  -- Reconnaissance automatique du plan d'eau au point choisi
  altitude   numeric(7,1),
  indice_eau text default '',

  lestage         text default '',
  combi_type      text default '',   -- Humide / Semi-étanche / Étanche
  combi_mm        text default '',
  combinaison     text default '',   -- ancien champ libre, conservé

  -- Bouteille : le gaz respiré caractérise le bloc, pas la plongée.
  gaz_type     text default 'air',   -- air | nitrox | trimix | recycleur
  gaz_o2       integer,
  gaz_he       integer,
  gaz_setpoint numeric(3,2),
  bloc_type    text default '',      -- Mono / Bi / relais / side-mount
  bloc_matiere text default '',      -- Acier / Alu
  bloc_litres     numeric(5,2),
  pression_depart integer,
  pression_fin    integer,

  -- Matériel du profil réellement emporté ce jour-là (liste d'identifiants)
  materiel_ids jsonb,

  temp_air     numeric(4,1),
  temp_surface numeric(4,1),
  temp_fond    numeric(4,1),
  visibilite   text default '',
  courant      text default '',

  palanquee_mode text default '',
  chef_buddy_id  uuid references public.buddies(id) on delete set null,
  -- Un tampon par plongeur présent : { "<buddy_id>": "<stamp_id>" }
  tampons        jsonb not null default '{}',
  stamp_id       uuid references public.buddy_stamps(id) on delete set null,
  stamp_path     text,           -- tampon photographié directement sur la plongée

  fait         text default '',
  vu           text default '',
  observations text default '',

  -- « Ce que j'ai vu », en trois catégories.
  -- Chaque entrée : { id, nom, sci, photo, source }
  vu_faune   jsonb not null default '[]',
  vu_flore   jsonb not null default '[]',
  vu_epaves  jsonb not null default '[]',

  -- Données importées de l'ordinateur de plongée.
  -- Une plongée peut correspondre à PLUSIEURS enregistrements Suunto
  -- (remontée en surface puis réimmersion) : voir la table dive_suunto.
  suunto_synced_at timestamptz,
  profil         jsonb,          -- [{t: secondes, d: mètres, temp: °C}, …]

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rattrapage si la table existait déjà sans ces colonnes.
alter table public.dives add column if not exists vu_faune  jsonb not null default '[]';
alter table public.dives add column if not exists vu_flore  jsonb not null default '[]';
alter table public.dives add column if not exists vu_epaves jsonb not null default '[]';
alter table public.dives add column if not exists palier_secu     boolean not null default false;
alter table public.dives add column if not exists palier_secu_min integer;
alter table public.dives add column if not exists niveau     text default '';
alter table public.dives add column if not exists altitude   numeric(7,1);
alter table public.dives add column if not exists indice_eau text default '';
alter table public.dives add column if not exists combi_type text default '';
alter table public.dives add column if not exists combi_mm   text default '';
alter table public.dives add column if not exists options_refusees  text[] not null default '{}';
alter table public.dives add column if not exists options_manuelles text[] not null default '{}';
alter table public.dives add column if not exists gaz_type     text default 'air';
alter table public.dives add column if not exists gaz_o2       integer;
alter table public.dives add column if not exists gaz_he       integer;
alter table public.dives add column if not exists gaz_setpoint numeric(3,2);
alter table public.dives add column if not exists bloc_type    text default '';
alter table public.dives add column if not exists bloc_matiere text default '';
alter table public.dives add column if not exists materiel_ids jsonb;
alter table public.dives add column if not exists tampons      jsonb not null default '{}';

-- Migration : le gaz vivait dans les options de la plongée. Il appartient
-- à la bouteille, pas à la plongée : on le déplace, puis on nettoie.
update public.dives set gaz_type = 'recycleur' where 'Recycleur' = any(options) and gaz_type = 'air';
update public.dives set gaz_type = 'trimix'    where 'Trimix'    = any(options) and gaz_type = 'air';
update public.dives set gaz_type = 'nitrox'    where 'Nitrox'    = any(options) and gaz_type = 'air';
update public.dives set bloc_type = 'Bi-bouteilles'
 where 'Bi-bouteilles' = any(options) and coalesce(bloc_type, '') = '';
update public.dives
   set options = array_remove(array_remove(array_remove(array_remove(array_remove(
                 options, 'Nitrox'), 'Trimix'), 'Recycleur'), 'Bi-bouteilles'), 'Plongée à l''air')
 where options && array['Nitrox','Trimix','Recycleur','Bi-bouteilles','Plongée à l''air'];

-- Répartition des plongées par niveau : le niveau courant d'un carnet est
-- le plus élevé jamais enregistré, jamais une valeur saisie sur le profil.
create index if not exists dives_niveau_idx on public.dives(diver_id, niveau)
  where niveau is not null and niveau <> '';

create index if not exists dives_diver_date_idx on public.dives(diver_id, date desc);

-- Enregistrements Suunto rattachés à une plongée.
-- Une même plongée réelle peut être découpée en plusieurs « workouts »
-- par l'ordinateur (passage en surface). La contrainte d'unicité sur
-- (owner_id, workout_key) empêche d'importer deux fois le même.
create table if not exists public.dive_suunto (
  workout_key text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dive_id     uuid not null references public.dives(id) on delete cascade,
  start_time  timestamptz,
  duree_min   integer,
  prof_max    numeric(5,2),
  resume      jsonb,
  imported_at timestamptz not null default now(),
  primary key (owner_id, workout_key)
);

create index if not exists dive_suunto_dive_idx on public.dive_suunto(dive_id);

-- Compagnons présents sur une plongée (relation n-n)
create table if not exists public.dive_buddies (
  dive_id  uuid not null references public.dives(id) on delete cascade,
  buddy_id uuid not null references public.buddies(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  primary key (dive_id, buddy_id)
);

create index if not exists dive_buddies_buddy_idx on public.dive_buddies(buddy_id);

-- ------------------------------------------------------------
--  4. Jetons Suunto — JAMAIS lisibles depuis le navigateur
-- ------------------------------------------------------------

create table if not exists public.suunto_accounts (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  suunto_user   text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Vue sûre : dit seulement SI le compte est relié, jamais les jetons.
-- Volontairement en « security definer » (comportement par défaut) : la vue
-- traverse RLS, mais le WHERE ci-dessous garantit qu'on ne voit que sa ligne.
create or replace view public.suunto_status as
  select owner_id,
         suunto_user,
         (access_token is not null) as connected,
         expires_at,
         last_sync_at
  from public.suunto_accounts
  where owner_id = auth.uid();

grant select on public.suunto_status to authenticated;

-- ------------------------------------------------------------
--  4 bis. Marqueur d'installation
--  Permet à l'application de savoir que ce script a déjà été
--  exécuté, et de ne plus jamais proposer l'initialisation.
-- ------------------------------------------------------------

create table if not exists public.app_meta (
  key   text primary key,
  value text not null
);

insert into public.app_meta (key, value) values ('schema_version', '7')
on conflict (key) do update set value = excluded.value;

-- ------------------------------------------------------------
--  5. Compteur de plongées (toujours calculé, jamais saisi)
-- ------------------------------------------------------------

create or replace view public.diver_stats
with (security_invoker = true) as
  select d.id as diver_id,
         d.owner_id,
         count(dv.id)                              as dive_count,
         coalesce(sum(dv.duree_min), 0)            as total_min,
         max(dv.prof_max)                          as max_depth,
         round(avg(dv.prof_max), 1)                as avg_depth,
         max(dv.date)                              as last_date
  from public.divers d
  left join public.dives dv on dv.diver_id = d.id
  group by d.id, d.owner_id;

-- ------------------------------------------------------------
--  6. Déclencheurs
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['divers','buddies','dives','suunto_accounts'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;

  foreach t in array array['divers','buddies','buddy_stamps','dives','dive_buddies','dive_suunto','certifications'] loop
    execute format('drop trigger if exists owner_%1$s on public.%1$s', t);
    execute format('create trigger owner_%1$s before insert on public.%1$s
                    for each row execute function public.set_owner()', t);
  end loop;
end $$;

-- Numérotation automatique : si numero est vide, on prend max + 1 du carnet.
create or replace function public.autonumber_dive()
returns trigger language plpgsql as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero
    from public.dives where diver_id = new.diver_id;
  end if;
  return new;
end $$;

drop trigger if exists autonumber_dives on public.dives;
create trigger autonumber_dives before insert on public.dives
  for each row execute function public.autonumber_dive();

-- ------------------------------------------------------------
--  7. Row Level Security
--     Sans ces règles, la clé anon publique laisserait tout lire.
-- ------------------------------------------------------------

alter table public.divers          enable row level security;
alter table public.buddies         enable row level security;
alter table public.buddy_stamps    enable row level security;
alter table public.dives           enable row level security;
alter table public.dive_buddies    enable row level security;
alter table public.dive_suunto     enable row level security;
alter table public.certifications  enable row level security;
alter table public.suunto_accounts enable row level security;
alter table public.app_meta        enable row level security;

-- app_meta : lisible par toute session authentifiée, jamais modifiable.
drop policy if exists "meta_read" on public.app_meta;
create policy "meta_read" on public.app_meta for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['divers','buddies','buddy_stamps','dives','dive_buddies','dive_suunto','certifications'] loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format($f$
      create policy "owner_all" on public.%I
        for all
        to authenticated
        using (owner_id = auth.uid())
        with check (owner_id = auth.uid())
    $f$, t);
  end loop;
end $$;

-- suunto_accounts : AUCUNE politique pour le rôle « authenticated ».
-- RLS est actif sans la moindre règle permissive : le navigateur ne peut donc
-- ni lire, ni écrire, ni supprimer les jetons, même avec une session valide.
-- Seule l'Edge Function (clé service_role, qui contourne RLS) y touche.
-- L'application passe par la vue suunto_status pour savoir si le compte est
-- relié, et par la fonction pour le délier.
revoke all on public.suunto_accounts from authenticated, anon;

-- ------------------------------------------------------------
--  8. Storage : bucket privé pour les tampons
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stamps', 'stamps', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Chaque fichier vit dans un dossier nommé d'après l'utilisateur :
--   stamps/<auth.uid()>/<uuid>.jpg
do $$
begin
  execute 'drop policy if exists "stamps_own" on storage.objects';
  execute $f$
    create policy "stamps_own" on storage.objects
      for all
      to authenticated
      using (bucket_id = 'stamps' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'stamps' and (storage.foldername(name))[1] = auth.uid()::text)
  $f$;
end $$;

-- ------------------------------------------------------------
--  9. Verrou d'inscription (optionnel mais recommandé)
--
--  En plus de désactiver « Allow new users to sign up » dans
--  Authentication → Providers → Email, ce garde-fou refuse toute
--  création de compte avec un autre email que le tien.
--  Remplace l'adresse puis décommente le bloc.
-- ------------------------------------------------------------

-- create or replace function public.only_allowed_signup()
-- returns trigger language plpgsql security definer as $$
-- begin
--   if new.email is distinct from 'soaresden@gmail.com' then
--     raise exception 'Inscription fermée';
--   end if;
--   return new;
-- end $$;
--
-- drop trigger if exists allowed_signup on auth.users;
-- create trigger allowed_signup before insert on auth.users
--   for each row execute function public.only_allowed_signup();
