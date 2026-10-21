# Hevy adapter contract

Verified 21 October 2026 against the [official interactive docs](https://api.hevyapp.com/docs/) and its public OpenAPI document embedded in `swagger-ui-init.js` (version 0.0.1). The provider says the API can change and requires Hevy Pro. Poll away from `xx:00`; this app schedules 21:17 Melbourne time.

Authentication is a server-only `api-key` HTTP header. Source adapter requests use a fixed HTTPS Hevy origin, GET only and reject redirects.

Endpoints used:

- GET `/v1/workouts?page=1&pageSize=10`: completed workouts, response `page`, `page_count`, `workouts`. Maximum page size 10.
- GET `/v1/workouts/count`: `workout_count`; used before/after full reconciliation.
- GET `/v1/workouts/events?page=1&pageSize=10&since=<ISO>`: newest-first update/delete events, response `page`, `page_count`, `events`. Updated events include complete `workout`; deleted events include `id`, `deleted_at`. First event for each source ID wins before atomic commit. Five-minute overlap makes repeat imports safe.

Available but intentionally not fetched: user info, routine templates, routine folders, exercise templates/history, body measurements. Existence of an endpoint is not consent to import that data. The current import contains completed workouts only. No Apple Health, Garmin or other service access is implied.

Workout source payloads retain routine reference, descriptions, original start/end/create/update timestamps; exercises retain stable template IDs, source indices, notes and superset IDs. Sets retain type, recorded kg, reps, subjective RPE, distance meters, duration seconds and custom metric. Unknown source fields remain in JSONB.

429 and server errors use bounded retries and backoff; `Retry-After` seconds or HTTP dates are respected within the deadline, otherwise the sync fails for later retry. Authentication failures are not retried. A failed page/schema/count check never calls the commit function. The app does not assume an undocumented fixed numeric polling quota. No Hevy key was read during local implementation and no live Hevy requests were made; live adapter behavior remains to be verified after backend provisioning.
