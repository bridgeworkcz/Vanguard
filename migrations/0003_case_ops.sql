alter table applications add column if not exists assigned_manager_id text not null default '';
alter table vacancies add column if not exists blocked_citizenships text not null default '';
alter table documents add column if not exists rejection_reason text not null default '';
