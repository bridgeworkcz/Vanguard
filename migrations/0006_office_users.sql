create table if not exists office_users (
  id text primary key,
  email text not null default '',
  phone text not null default '',
  full_name text not null default '',
  roles text not null default '["CLIENT"]',
  password_hash text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists office_users_email_idx on office_users (lower(email));

alter table applications add column if not exists commission_paid boolean not null default false;
alter table applications add column if not exists client_lang text not null default 'en';
alter table applications add column if not exists account_closed boolean not null default false;
