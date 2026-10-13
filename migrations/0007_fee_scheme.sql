alter table applications add column if not exists fee_scheme text not null default 'legacy30';
alter table applications add column if not exists invoice2_due_at timestamptz;
alter table applications add column if not exists pay_reminded text not null default '';
alter table applications add column if not exists linked_to text not null default '';

create table if not exists auth_hits (
  bucket text primary key,
  hits int not null default 0,
  reset_at timestamptz not null
);

create table if not exists office_signin (
  user_id text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);
