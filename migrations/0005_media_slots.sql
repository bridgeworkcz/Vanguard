alter table media_items add column if not exists country text not null default '';
alter table media_items add column if not exists vacancy_id text not null default '';
alter table media_items add column if not exists starts_at text not null default '';
alter table media_items add column if not exists ends_at text not null default '';
alter table media_items add column if not exists cover boolean not null default false;
