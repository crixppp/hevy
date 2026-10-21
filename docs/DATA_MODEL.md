# Storage and provenance

`workouts` stores one lossless JSONB source record per `(owner_id, source_id)`, with separately indexed start time, source update time and ingestion time. The adapter validates source identity and exercise/set indices before commit. The source adapter is intentionally restricted to GET against a fixed Hevy origin, with redirects rejected.

Security-invoker views normalize the canonical records into `exercise_appearances`, `workout_sets`, `exercise_identities` and `routine_references`. Appearance identity is workout ID + exercise index; set identity adds set index. RLS on the underlying source table also applies to views. JSONB avoids maintaining two source copies while retaining future fields such as custom metrics; this is a deliberate single-user simplification. Workout payloads include title/notes/order/supersets and source timestamps. No body measurements, profile or routine templates are assumed imported.

`dashboard_entries` holds typed, dashboard-only documents: equipment profiles, mappings, training blocks, annotations, goals, immutable-in-UI forecast snapshots, and user priority settings. Each entry has a stable UUID, owner FK and update timestamp. Context is isolated from Hevy and never written back. Equipment profiles use exercise ID, dates, load mode, increment, reviewed flag and explicit logging convention. Latest effective start wins on overlap; prefer ending old profiles to avoid ambiguous history. Mappings are descriptive labels and cannot merge exercise performance.

`dashboard_owners` is an administrative allowlist referencing `auth.users`; users cannot add themselves. `sync_state` tracks last attempt/success/full reconciliation and the lease token. `sync_runs` records bounded diagnostics. The owner has read-only access to source/sync records, CRUD access to their dashboard context. Anonymous users and other authenticated users cannot access private rows. Only the service role may invoke sync transaction functions.

Imports gather all pages before one `finish_sync` transaction. Incremental events are newest-first: the first occurrence of each workout ID wins, including deletes. Full reconciliation validates workout counts before/after pagination and rejects duplicated pages or moving page counts. It replaces source rows only after validation. A 120-second lease and 60-second request cooldown prevent overlap; workers have a shorter 95-second fetch deadline. Failure leaves the previous complete dataset intact. An expired worker is recorded on the next attempt. Daily events overlap the last successful cutoff by five minutes; a full read runs at least weekly. A source edit during a full read that changes neither count nor pagination may be corrected on the next event sync; the API offers no snapshot isolation.

The source-adapter boundary can support a future explicitly requested running importer. No running, sleep, body measurements, health or nutrition records are fabricated.

## Deliberate v1 limits

Dashboard context currently retains the latest editable entry, not a full edit audit trail; export before major mapping/profile changes. Snapshot source fingerprints include pre-cutoff source records; profile JSON is also checked before scoring. The fingerprint is a deterministic change detector, not a cryptographic integrity guarantee. Editing an old profile invalidates related snapshots, and source revisions invalidate scoring. Deleting a source workout does not delete dashboard annotations.

Histories that cannot fetch within 95 seconds fail safely. Resumable staging would be the next ingestion extension for very large imports or slow Hevy responses. No partial import is exposed as complete.
