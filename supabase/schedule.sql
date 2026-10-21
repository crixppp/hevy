-- Run ONLY after project_url and sync_schedule_secret are stored via the Vault UI.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Cron runs on UTC. Check the named local timezone every minute: correct at both DST offsets.
select cron.schedule('hevy-melbourne-daily','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/sync-hevy',
  headers:=jsonb_build_object('Content-Type','application/json','x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='sync_schedule_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=110000
 ) where to_char(now() at time zone 'Australia/Melbourne','HH24:MI')='21:17';
$job$);
