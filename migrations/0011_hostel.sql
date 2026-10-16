alter table vacancies add column if not exists hostel_eur integer not null default 0;
alter table vacancies add column if not exists hostel_local integer not null default 0;
alter table vacancies add column if not exists hostel_currency text not null default '';
alter table applications add column if not exists hostel boolean not null default false;
