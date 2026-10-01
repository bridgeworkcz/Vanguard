create table if not exists profiles (
  user_id text primary key,
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'CLIENT'
);

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists visa_products (
  id text primary key,
  country text not null,
  name text not null,
  duration text not null,
  description text not null,
  base_price integer not null,
  currency text not null default 'EUR',
  production_min_weeks integer not null,
  production_max_weeks integer not null,
  allowed_processing text not null,
  active boolean not null default true
);

create table if not exists vacancies (
  id text primary key,
  title text not null,
  country text not null,
  visa_product_id text not null,
  employer text not null,
  salary_net text not null,
  accommodation text not null,
  working_hours text not null,
  description text not null,
  requirements text not null,
  quota integer not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id text primary key,
  full_name text not null,
  position text not null,
  phone text not null default '',
  photo_data text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists media_items (
  id text primary key,
  kind text not null,
  title text not null,
  caption text not null default '',
  image_data text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists partners (
  id text primary key,
  country text not null,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists applications (
  id text primary key,
  user_id text,
  client_email text not null default '',
  vacancy_id text not null,
  visa_product_id text not null,
  country text not null,
  citizenship text not null,
  processing text not null,
  total_cost integer not null,
  currency text not null default 'EUR',
  production_weeks integer not null,
  stage integer not null default 1,
  status text not null default 'OPEN',
  process_stage text not null default 'IN_PROCESS',
  questionnaire text not null default '{}',
  profile_complete boolean not null default false,
  rejection_reason text not null default '',
  dispatch_note text not null default '',
  stage2_at timestamptz,
  stage3_at timestamptz,
  cancel_deadline_at timestamptz,
  doc_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_user_idx on applications (user_id);
create index if not exists applications_stage_idx on applications (stage, status);

create table if not exists documents (
  id text primary key,
  application_id text not null,
  user_id text,
  category text not null,
  file_name text not null,
  mime text not null,
  data text not null,
  status text not null default 'UPLOADED',
  created_at timestamptz not null default now()
);

create index if not exists documents_app_idx on documents (application_id);

create table if not exists messages (
  id text primary key,
  application_id text not null,
  author_id text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id text primary key,
  actor_id text not null,
  action text not null,
  target text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
