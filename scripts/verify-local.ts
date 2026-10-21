// Optional, private, local-only structural/metric check. No workout content is printed.
import {readFileSync} from 'node:fs';
import {validateWorkout} from '../supabase/functions/_shared/hevy.ts';
import {summary,quality,dateKey} from '../src/analytics.ts';
import type {Workout} from '../src/types.ts';
const path=process.argv[2];if(!path)throw Error('Provide a local Hevy export path. Do not copy it into the project.');
const data=JSON.parse(readFileSync(path,'utf8'));
const ws:Workout[]=data.workouts.map(validateWorkout);
if(new Set(ws.map(w=>w.id)).size!==ws.length)throw Error('Duplicate source IDs');
const dates=ws.map(w=>dateKey(w.start_time)).sort();const s=summary(ws,dates[0],dates.at(-1)!);
console.log(JSON.stringify({source:'local only; no data transferred',workouts:ws.length,sets:quality(ws).sets,workingSets:s.working,warmups:s.warmups,flaggedSetRecords:quality(ws).invalid,validation:'Schema and deterministic aggregate calculations completed; equipment-dependent estimates remain gated.'},null,2));
