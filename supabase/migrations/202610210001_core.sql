-- Owner must be provisioned administratively. No public registration can grant access.
create table public.dashboard_owners (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.dashboard_owners enable row level security;
create policy self_owner on public.dashboard_owners for select to authenticated using(user_id=auth.uid());
revoke all on public.dashboard_owners from anon,authenticated;
grant select on public.dashboard_owners to authenticated;
create function public.is_dashboard_owner() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from dashboard_owners where user_id=auth.uid()) $$;
revoke all on function public.is_dashboard_owner() from public; grant execute on function public.is_dashboard_owner() to authenticated;

create table public.workouts (
 owner_id uuid not null references public.dashboard_owners(user_id) on delete cascade,
 source_id text not null, source text not null default 'hevy' check(source='hevy'),
 start_time timestamptz not null, source_updated_at timestamptz not null,
 ingested_at timestamptz not null default now(), payload jsonb not null,
 primary key(owner_id,source_id),check(payload->>'id'=source_id)
);
create index workouts_time on public.workouts(owner_id,start_time desc);
alter table public.workouts enable row level security;
create policy owner_workouts on public.workouts for select to authenticated using(owner_id=auth.uid() and public.is_dashboard_owner());
revoke all on public.workouts from anon,authenticated; grant select on public.workouts to authenticated;

create table public.dashboard_entries (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.dashboard_owners(user_id) on delete cascade,
 kind text not null check(kind in ('block','annotation','goal','equipment','mapping','snapshot','settings')),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<100000),updated_at timestamptz not null default now()
);
create index entries_owner_kind on public.dashboard_entries(owner_id,kind);
alter table public.dashboard_entries enable row level security;
create policy owner_entries on public.dashboard_entries for all to authenticated using(owner_id=auth.uid() and public.is_dashboard_owner()) with check(owner_id=auth.uid() and public.is_dashboard_owner());
revoke all on public.dashboard_entries from anon,authenticated; grant select,insert,update,delete on public.dashboard_entries to authenticated;

-- Normalized, security-invoker views derive from lossless source storage. One canonical copy.
create view public.exercise_appearances with(security_invoker=true) as select owner_id,source_id as workout_id,(e->>'index')::int as exercise_index,e->>'exercise_template_id' as exercise_id,e->>'title' as title,e->>'notes' as notes,e->>'superset_id' as superset_id,e->'sets' as sets from public.workouts cross join lateral jsonb_array_elements(payload->'exercises') e;
create view public.workout_sets with(security_invoker=true) as select owner_id,workout_id,exercise_id,exercise_index,(s->>'index')::int as set_index,s->>'type' as set_type,s->>'weight_kg' as weight_kg,s->>'reps' as reps,s->>'rpe' as rpe,s->>'distance_meters' as distance_meters,s->>'duration_seconds' as duration_seconds from public.exercise_appearances cross join lateral jsonb_array_elements(sets) s;
create view public.exercise_identities with(security_invoker=true) as select distinct owner_id,exercise_id,title from public.exercise_appearances;
create view public.routine_references with(security_invoker=true) as select distinct owner_id,payload->>'routine_id' as routine_id from public.workouts where payload->>'routine_id' is not null;
grant select on public.exercise_appearances,public.workout_sets,public.exercise_identities,public.routine_references to authenticated;

create table public.sync_state(owner_id uuid primary key references public.dashboard_owners(user_id) on delete cascade,last_attempt timestamptz,last_success timestamptz,last_full timestamptz,lease_until timestamptz,lease_token uuid,error text);
create table public.sync_runs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.dashboard_owners(user_id) on delete cascade,started_at timestamptz not null default now(),finished_at timestamptz,status text not null,mode text not null,changed integer,error text);
create index sync_runs_owner_time on public.sync_runs(owner_id,started_at desc);
alter table public.sync_state enable row level security;alter table public.sync_runs enable row level security;
create policy owner_sync_state on public.sync_state for select to authenticated using(owner_id=auth.uid() and public.is_dashboard_owner());
create policy owner_sync_runs on public.sync_runs for select to authenticated using(owner_id=auth.uid() and public.is_dashboard_owner());
revoke all on public.sync_state,public.sync_runs from anon,authenticated;grant select on public.sync_state,public.sync_runs to authenticated;

create function public.acquire_sync(p_owner uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s sync_state;begin
 if not exists(select 1 from dashboard_owners where user_id=p_owner) then raise exception 'Owner unavailable';end if;
 insert into sync_state(owner_id) values(p_owner) on conflict do nothing;
 select * into s from sync_state where owner_id=p_owner for update;
 if s.lease_until>now() then raise exception 'Sync already running';end if;
 if s.last_attempt>now()-interval '60 seconds' then raise exception 'Please wait before syncing again';end if;
 update sync_runs set status='expired',finished_at=now(),error='Worker expired; previous dataset preserved' where owner_id=p_owner and status='running';
 update sync_state set lease_until=now()+interval '120 seconds',lease_token=p_token,last_attempt=now(),error=null where owner_id=p_owner;
 return to_jsonb(s);end $$;

create function public.finish_sync(p_owner uuid,p_token uuid,p_changes jsonb,p_full boolean,p_cutoff timestamptz) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from sync_state where owner_id=p_owner and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'Sync lease lost';end if;
 if jsonb_typeof(p_changes)!='array' then raise exception 'Invalid changes';end if;
 if p_full then delete from workouts where owner_id=p_owner and source_id not in(select x->>'id' from jsonb_array_elements(p_changes)x);end if;
 delete from workouts where owner_id=p_owner and source_id in(select x->>'id' from jsonb_array_elements(p_changes)x where x->'payload'='null'::jsonb);
 insert into workouts(owner_id,source_id,start_time,source_updated_at,payload)
 select p_owner,x->>'id',(x->'payload'->>'start_time')::timestamptz,(x->'payload'->>'updated_at')::timestamptz,x->'payload' from jsonb_array_elements(p_changes)x where x->'payload'!='null'::jsonb
 on conflict(owner_id,source_id) do update set payload=excluded.payload,start_time=excluded.start_time,source_updated_at=excluded.source_updated_at,ingested_at=now();
 update sync_state set last_success=p_cutoff,last_full=case when p_full then p_cutoff else last_full end,lease_until=null,lease_token=null,error=null where owner_id=p_owner;
end $$;
create function public.fail_sync(p_owner uuid,p_token uuid,p_error text) returns void language sql security definer set search_path=public as $$ update sync_state set lease_until=null,lease_token=null,error=left(p_error,200) where owner_id=p_owner and lease_token=p_token $$;
revoke all on function public.acquire_sync(uuid,uuid),public.finish_sync(uuid,uuid,jsonb,boolean,timestamptz),public.fail_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acquire_sync(uuid,uuid),public.finish_sync(uuid,uuid,jsonb,boolean,timestamptz),public.fail_sync(uuid,uuid,text) to service_role;
-- Explicit service grants avoid relying on project default privileges.
grant all on public.dashboard_owners,public.workouts,public.dashboard_entries,public.sync_state,public.sync_runs to service_role;
