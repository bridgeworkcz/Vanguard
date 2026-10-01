alter table applications add column if not exists referrer_user_id text not null default '';
alter table applications add column if not exists stage4_at timestamptz;
