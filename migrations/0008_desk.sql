alter table applications add column if not exists campaign text not null default '';
alter table vacancies add column if not exists housing_kind text not null default '';

create table if not exists manager_cover (
  manager_id text primary key,
  cover_id text not null,
  until_at timestamptz not null
);

create table if not exists employer_links (
  token text primary key,
  application_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists employer_links_app_idx on employer_links (application_id);
