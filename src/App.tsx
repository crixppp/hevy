import { parseLocalExport } from "./localImport";
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Dumbbell,
  FlaskConical,
  Layers,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { Workout, Entry, Profile, MetaKind, Forecast } from "./types";
import { backend, loadPrivate, download } from "./backend";
import {
  dateKey,
  dayAdd,
  daysBetween,
  weekKey,
  summary,
  weeks,
  exerciseList,
  exerciseSeries,
  quality,
  working,
  setVolume,
  e1rm,
  duration,
  mean,
  profileAt,
  VERSION,
} from "./analytics";
import { forecast, evaluate } from "./forecast";
const nav = [
  ["overview", "Overview", Activity],
  ["calendar", "Training calendar", CalendarDays],
  ["exercises", "Exercises", Dumbbell],
  ["workouts", "Workouts", ClipboardList],
  ["distribution", "Distribution", BarChart3],
  ["blocks", "Training blocks", Layers],
  ["goals", "Goals & forecasts", Target],
  ["reviews", "Weekly review", TrendingUp],
  ["methods", "Methods & quality", FlaskConical],
  ["settings", "Settings", Settings],
] as const;
const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("en-AU", { maximumFractionDigits: d });
const pretty = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
const iconProps = { size: 18, strokeWidth: 1.7 };
function Panel({
  title,
  eyebrow,
  aside,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <FlaskConical size={24} />
      <p>{children}</p>
    </div>
  );
}
const LazyChart = lazy(() => import("./Chart"));
function Chart(props: React.ComponentProps<typeof LazyChart>) {
  return (
    <Suspense fallback={<div className="chart empty">Loading chart…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}
function App() {
  const localFileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"login" | "demo" | "local" | "private">(
      "login",
    ),
    [page, setPage] = useState("overview"),
    [mobile, setMobile] = useState(false),
    [theme, setTheme] = useState(
      localStorage.getItem("training-lens-theme") ?? "dark",
    );
  const [workouts, setWorkouts] = useState<Workout[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [sync, setSync] = useState<any>(null),
    [user, setUser] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [recovery, setRecovery] = useState(false);
  const [start, setStart] = useState(dayAdd(dateKey(new Date()), -83)),
    [end, setEnd] = useState(dateKey(new Date())),
    [selectedExercise, setSelectedExercise] = useState(""),
    [profileId, setProfileId] = useState("all"),
    [search, setSearch] = useState(""),
    [selectedWorkout, setSelectedWorkout] = useState(""),
    [compareWorkout, setCompareWorkout] = useState(""),
    [calendarDay, setCalendarDay] = useState(""),
    [editor, setEditor] = useState<{ kind: MetaKind; entry?: Entry } | null>(
      null,
    ),
    [compareBlocks, setCompareBlocks] = useState<string[]>([]),
    [horizon, setHorizon] = useState(28);
  const generation = useRef(0);
  const today = mode === "demo" ? "2026-10-21" : dateKey(new Date());
  const profiles = useMemo(
    () =>
      entries
        .filter((e) => e.kind === "equipment")
        .map((e) => ({ ...e.data, id: e.id }) as Profile),
    [entries],
  );
  const exercises = useMemo(() => exerciseList(workouts), [workouts]);
  const filtered = useMemo(
    () =>
      workouts
        .filter(
          (w) => dateKey(w.start_time) >= start && dateKey(w.start_time) <= end,
        )
        .sort((a, b) => b.start_time.localeCompare(a.start_time)),
    [workouts, start, end],
  );
  const stats = useMemo(
    () => summary(workouts, start, end),
    [workouts, start, end],
  );
  const weekly = useMemo(
    () => weeks(workouts, start, end),
    [workouts, start, end],
  );
  const q = useMemo(() => quality(workouts), [workouts]);
  const exerciseId = selectedExercise || exercises[0]?.id || "";
  const series = useMemo(
    () => exerciseSeries(workouts, exerciseId, profiles),
    [workouts, exerciseId, profiles],
  );
  const selectedSeries = series.filter(
    (p) => profileId === "all" || p.profileId === profileId,
  );
  const visibleSeries = selectedSeries.filter(
    (p) => p.date >= start && p.date <= end,
  );
  const nowCutoff = useMemo(
    () =>
      mode === "demo"
        ? "2026-10-21T23:59:59.999+11:00"
        : new Date().toISOString(),
    [workouts, mode],
  );
  const prediction = useMemo(
    () => forecast(selectedSeries, workouts, nowCutoff, horizon),
    [series, profileId, workouts, nowCutoff, horizon],
  );
  const settingsEntry = entries.find((e) => e.kind === "settings");
  const priorityIds: string[] = settingsEntry?.data.priorityIds ?? [];
  const blocks = entries.filter((e) => e.kind === "block"),
    goals = entries.filter((e) => e.kind === "goal"),
    annotations = entries.filter((e) => e.kind === "annotation");
  async function load() {
    const g = generation.current;
    setLoading(true);
    try {
      const d = await loadPrivate();
      if (g !== generation.current) return;
      setWorkouts(d.workouts);
      setEntries(d.entries);
      setSync(d.state);
    } catch (e) {
      if (g === generation.current) setNotice((e as Error).message);
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }
  function clear() {
    generation.current++;
    setWorkouts([]);
    setEntries([]);
    setSync(null);
    setSelectedExercise("");
    setSelectedWorkout("");
    setCompareWorkout("");
    setCompareBlocks([]);
    setEditor(null);
    setUser(null);
    setMode("login");
    setRecovery(false);
    setSearch("");
    setLoading(false);
    setNotice("");
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("training-lens-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!backend) return;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((event, session) => {
      clearTimeout(expiry);
      if (event === "SIGNED_OUT" || !session) {
        clear();
        return;
      }
      if (session.expires_at)
        expiry = setTimeout(
          () => {
            clear();
            void backend?.auth.signOut({ scope: "local" });
          },
          Math.max(0, session.expires_at * 1000 - Date.now()),
        );
      setUser(session.user.id);
      setMode("private");
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "PASSWORD_RECOVERY"
      )
        setTimeout(() => void load(), 0);
    });
    return () => {
      clearTimeout(expiry);
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const listener = () => {
      const p = location.hash.replace("#/", "");
      if (nav.some((n) => n[0] === p)) setPage(p);
    };
    listener();
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  function navigate(id: string) {
    setPage(id);
    location.hash = "/" + id;
    setMobile(false);
    setSearch("");
  }
  async function demo() {
    generation.current++;
    const { demoWorkouts, demoEntries } = await import("./demo");
    setWorkouts(structuredClone(demoWorkouts));
    setEntries(structuredClone(demoEntries));
    setMode("demo");
    setStart("2026-07-30");
    setEnd("2026-10-21");
    setNotice("");
  }
  async function save(kind: MetaKind, data: Record<string, any>, id?: string) {
    if (mode === "demo" || mode === "local") {
      setEntries((es) =>
        id
          ? es.map((e) => (e.id === id ? { ...e, data } : e))
          : [...es, { id: crypto.randomUUID(), kind, data }],
      );
      return;
    }
    if (!backend || !user) throw Error("Sign in to save.");
    const value = {
      kind,
      data,
      owner_id: user,
      updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await backend.from("dashboard_entries").update(value).eq("id", id)
      : await backend.from("dashboard_entries").insert(value);
    if (error) throw Error("Save failed. No change was confirmed.");
    await load();
  }
  async function remove(entry: Entry) {
    if (mode === "demo" || mode === "local")
      setEntries((es) => es.filter((e) => e.id !== entry.id));
    else {
      const { error } = await backend!
        .from("dashboard_entries")
        .delete()
        .eq("id", entry.id);
      if (error) {
        setNotice("Delete failed.");
        return;
      }
      await load();
    }
  }
  async function openLocalExport(file: File) {
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("Choose a JSON export smaller than 25 MB.");
      const imported = parseLocalExport(await file.text());
      generation.current++;
      setWorkouts(imported.workouts);
      setEntries([]);
      setSync(null);
      setUser(null);
      setMode("local");
      setSelectedExercise("");
      setSelectedWorkout("");
      setCompareWorkout("");
      setProfileId("all");
      setCompareBlocks([]);
      setStart(dayAdd(dateKey(new Date()), -83));
      setEnd(dateKey(new Date()));
      setNotice(
        `Opened ${imported.workouts.length} workouts on this device. No file data was uploaded. Context edits stay in memory; export them before leaving.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not open this export.",
      );
    }
  }
  async function syncNow() {
    if (mode === "local") {
      localFileInput.current?.click();
      return;
    }
    if (mode === "demo") {
      setNotice("Demo mode uses synthetic data and never calls Hevy.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await backend!.functions.invoke("sync-hevy", {
        body: {},
      });
      if (error || data?.error)
        throw Error(
          data?.error ??
            "Sync request failed. Check Methods & quality for backend diagnostics.",
        );
      await load();
      setNotice(`Sync complete · ${data.changed} source changes.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function metricCards() {
    return (
      <div className="stat-strip">
        {[
          [
            "Recorded sessions",
            fmt(stats.sessions),
            "Across " + stats.days + " active days",
            Activity,
          ],
          [
            "Working sets",
            fmt(stats.working),
            stats.warmups + " warmup sets separate",
            Layers,
          ],
          [
            "Sessions / week",
            fmt(stats.frequency, 1),
            "Calculated over selected dates",
            CalendarDays,
          ],
          [
            "Avg. session",
            fmt(stats.duration) + " min",
            "Elapsed time, including breaks",
            TrendingUp,
          ],
        ].map(([label, value, sub, Icon]: any) => (
          <div className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={16} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
    );
  }
  function workoutLink(w: Workout) {
    return (
      <button
        className="text-button"
        onClick={() => {
          setSelectedWorkout(w.id);
          navigate("workouts");
        }}
      >
        {w.title}
        <ChevronRight size={15} />
      </button>
    );
  }
  function recent(list = filtered.slice(0, 5)) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Date</th>
              <th>Working sets</th>
              <th>Elapsed</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td>
                  {workoutLink(w)}
                  <small>{w.exercises.length} exercises</small>
                </td>
                <td>{pretty(dateKey(w.start_time))}</td>
                <td>
                  {w.exercises.reduce(
                    (n, e) => n + e.sets.filter(working).length,
                    0,
                  )}
                </td>
                <td>{fmt(duration(w))} min</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty>No sessions recorded in this range.</Empty>}
      </div>
    );
  }
  function weeklyReview() {
    const current = weekKey(end),
      previous = dayAdd(current, -7),
      a = summary(
        workouts,
        current,
        end < dayAdd(current, 6) ? end : dayAdd(current, 6),
      ),
      b = summary(workouts, previous, dayAdd(previous, 6));
    return (
      <>
        <p className="eyebrow">
          {pretty(current)} — {pretty(end)} ·{" "}
          {end < dayAdd(current, 6) ? "Partial week" : "Complete week"}
        </p>
        <h3>
          {a.sessions
            ? `${a.sessions} recorded sessions. A clearer picture with context.`
            : "No sessions recorded this week."}
        </h3>
        <p>
          {a.working} working sets across {a.days} recorded training days. The
          previous complete week had {b.sessions} sessions and {b.working}{" "}
          working sets.
          {end < dayAdd(current, 6)
            ? " These periods have different coverage; totals are not an equivalent-period progress comparison."
            : ""}
        </p>
        <p>
          {a.rpeCoverage === null
            ? "No working sets recorded; RPE coverage is unavailable. "
            : `Reported RPE is available for ${fmt(a.rpeCoverage * 100)}% of working sets. `}
          {a.rpeCoverage === null || a.rpeCoverage < 0.7
            ? "Missing effort data limits like-for-like interpretation."
            : "RPE remains a subjective report."}
        </p>
        <div className="inline-actions">
          <button
            onClick={() => {
              setStart(current);
              setEnd(end);
              navigate("workouts");
            }}
          >
            Inspect supporting sessions <ArrowRight size={15} />
          </button>
          <button
            onClick={() => {
              setStart(previous);
              setEnd(dayAdd(previous, 6));
              navigate("workouts");
            }}
          >
            Previous week
          </button>
        </div>
      </>
    );
  }
  function goalValue(g: Entry) {
    const p = profiles.find((p) => p.id === g.data.profileId);
    if (!p?.reviewed || (g.data.metric === "load" && p.mode !== "external"))
      return null;
    const ss = exerciseSeries(workouts, g.data.exerciseId, [p]).filter(
      (x) => x.date >= (g.data.start || "0000") && x.date <= today,
    );
    if (g.data.metric === "e1rm")
      return ss.length ? Math.max(...ss.map((x) => x.value)) : null;
    const values = workouts
      .filter(
        (w) =>
          dateKey(w.start_time) >= (g.data.start || "0000") &&
          dateKey(w.start_time) <= today,
      )
      .flatMap((w) =>
        w.exercises
          .filter(
            (e) =>
              e.exercise_template_id === g.data.exerciseId &&
              profileAt(profiles, g.data.exerciseId, dateKey(w.start_time))
                ?.id === p.id,
          )
          .flatMap((e) =>
            e.sets
              .filter(working)
              .filter(
                (s) =>
                  g.data.rpeMax == null ||
                  (s.rpe !== null && s.rpe <= g.data.rpeMax),
              )
              .flatMap((s) => {
                const v =
                  g.data.metric === "load"
                    ? s.reps === Number(g.data.reps)
                      ? s.weight_kg
                      : null
                    : g.data.metric === "distance"
                      ? s.distance_meters
                      : s.duration_seconds;
                return v !== null && v >= 0 ? [v] : [];
              }),
          ),
      );
    return values.length ? Math.max(...values) : null;
  }
  function goalCards() {
    return goals.length ? (
      goals.map((g) => {
        const v = goalValue(g),
          unit =
            g.data.metric === "distance"
              ? "m"
              : g.data.metric === "duration"
                ? "s"
                : "kg";
        return (
          <div className="goal-row" key={g.id}>
            <div>
              <span className="mini-label">USER GOAL</span>
              <h3>{g.data.name}</h3>
              <p>
                {fmt(v, 1)} / {fmt(g.data.target)} {unit} ·{" "}
                {v !== null && v >= g.data.target
                  ? "Achieved in recorded history"
                  : "Recorded progress"}
                {g.data.metric === "load"
                  ? ` · exactly ${g.data.reps} reps`
                  : ""}
              </p>
              {v === null && (
                <small>
                  Review equipment and record a compatible performance.
                </small>
              )}
              <progress
                aria-label={g.data.name}
                value={v ?? 0}
                max={g.data.target}
              />
            </div>
            <button
              className="icon-button"
              aria-label={"Edit " + g.data.name}
              onClick={() => setEditor({ kind: "goal", entry: g })}
            >
              <Settings size={17} />
            </button>
          </div>
        );
      })
    ) : (
      <Empty>Add a concrete goal to track recorded progress.</Empty>
    );
  }
  function renderPage() {
    switch (page) {
      case "overview":
        return (
          <>
            {metricCards()}
            <div className="two-col main-grid">
              <Panel
                title="The work, over time"
                eyebrow="TRAINING VOLUME"
                aside={
                  <span className="pill">
                    <i />
                    Working sets · weekly
                  </span>
                }
              >
                <Chart data={weekly} />
                <p className="footnote">
                  Warmups excluded. Edge weeks may be partial. More sets do not
                  automatically mean better training.
                </p>
              </Panel>
              <Panel
                title="This week in focus"
                eyebrow="YOUR TRAINING JOURNAL"
                className="review-card"
              >
                {weeklyReview()}
              </Panel>
            </div>
            <Panel
              title="The exercises that matter to you"
              eyebrow="PRIORITY EXERCISES"
              aside={
                <button
                  className="text-button"
                  onClick={() => navigate("settings")}
                >
                  Choose priorities <ArrowRight size={15} />
                </button>
              }
            >
              {priorityIds.length ? (
                <div className="priority-grid">
                  {priorityIds.map((id) => {
                    const ex = exercises.find((e) => e.id === id),
                      ps = exerciseSeries(workouts, id, profiles),
                      last = ps.at(-1),
                      exposures = workouts.filter(
                        (w) =>
                          dateKey(w.start_time) >= dayAdd(today, -27) &&
                          dateKey(w.start_time) <= today &&
                          w.exercises.some(
                            (e) => e.exercise_template_id === id,
                          ),
                      ).length;
                    return (
                      <button
                        className="priority-item"
                        key={id}
                        onClick={() => {
                          setSelectedExercise(id);
                          setProfileId("all");
                          navigate("exercises");
                        }}
                      >
                        <span>{ex?.name ?? id}</span>
                        <strong>
                          {last ? fmt(last.value, 1) + " kg" : "Not estimable"}
                        </strong>
                        <small>
                          {last
                            ? "Latest session e1RM · " + last.date
                            : "Review equipment conventions"}
                        </small>
                        <small>{exposures} recorded exposures in 28 days</small>
                        <ArrowUpRight size={17} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Choose a few priority exercises in Settings.</Empty>
              )}
            </Panel>
            <div className="two-col lower-grid">
              <Panel
                title="Recent sessions"
                eyebrow="THE LOGBOOK"
                aside={
                  <button
                    className="text-button"
                    onClick={() => navigate("workouts")}
                  >
                    All workouts <ArrowRight size={16} />
                  </button>
                }
              >
                {recent()}
              </Panel>
              <Panel
                title="A little closer"
                eyebrow="GOALS"
                aside={
                  <button
                    className="icon-button"
                    aria-label="Add goal"
                    onClick={() => setEditor({ kind: "goal" })}
                  >
                    <Plus size={18} />
                  </button>
                }
              >
                {goalCards()}
              </Panel>
            </div>
          </>
        );
      case "calendar": {
        const counts = new Map<string, Workout[]>();
        for (const w of filtered) {
          const d = dateKey(w.start_time);
          counts.set(d, [...(counts.get(d) ?? []), w]);
        }
        const dates = Array.from(
          { length: Math.min(731, Math.max(0, daysBetween(start, end) + 1)) },
          (_, i) => dayAdd(start, i),
        );
        return (
          <>
            <Panel
              title="Every session has a place"
              eyebrow="AUSTRALIA / MELBOURNE"
              aside={
                <span className="pill">
                  {stats.days} recorded training days
                </span>
              }
            >
              <p className="muted">
                Select a day to open its sessions. An empty day means no workout
                recorded.
              </p>
              <div className="calendar-grid">
                {dates.map((d) => (
                  <button
                    key={d}
                    title={`${d}: ${counts.get(d)?.length ?? 0} sessions`}
                    aria-label={`${d}: ${counts.get(d)?.length ?? 0} recorded sessions`}
                    className={
                      "calendar-cell " +
                      (counts.has(d) ? "trained " : "") +
                      (calendarDay === d ? "selected" : "")
                    }
                    onClick={() => setCalendarDay(d)}
                  >
                    <small>{pretty(d)}</small>
                    <strong>{counts.get(d)?.length ?? "·"}</strong>
                    {blocks.some((b) => b.data.start === d) && (
                      <span>Block start</span>
                    )}
                    {annotations.some(
                      (a) =>
                        a.data.start <= d && (a.data.end || a.data.start) >= d,
                    ) && <span>Context</span>}
                  </button>
                ))}
              </div>
              {dates.length === 731 && (
                <p>
                  Calendar displays up to 731 days. Narrow the filter for older
                  dates.
                </p>
              )}
            </Panel>
            <Panel title={calendarDay ? pretty(calendarDay) : "Choose a day"}>
              {recent(calendarDay ? (counts.get(calendarDay) ?? []) : [])}
            </Panel>
          </>
        );
      }
      case "exercises":
        return (
          <>
            <div className="explorer-controls">
              <label>
                Exercise
                <select
                  value={exerciseId}
                  onChange={(e) => {
                    setSelectedExercise(e.target.value);
                    setProfileId("all");
                  }}
                >
                  {exercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.sessions} exposures
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Equipment profile
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                >
                  <option value="all">All profiles · separated in table</option>
                  {profiles
                    .filter((p) => p.exerciseId === exerciseId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <button onClick={() => setEditor({ kind: "equipment" })}>
                <Plus size={16} />
                Equipment profile
              </button>
            </div>
            <Panel
              title={
                exercises.find((e) => e.id === exerciseId)?.name ??
                "Exercise explorer"
              }
              eyebrow="ESTIMATED STRENGTH · KG"
            >
              <p className="muted">
                Epley estimated 1RM · best eligible working set each session ·
                1–10 reps. Equipment must be reviewed.
              </p>
              {visibleSeries.length &&
              new Set(visibleSeries.map((p) => p.profileId)).size === 1 ? (
                <Chart
                  data={visibleSeries.map((p) => ({
                    ...p,
                    label: pretty(p.date),
                  }))}
                  metric="value"
                  unit="Estimated 1RM · kg"
                  kind="line"
                />
              ) : (
                <Empty>
                  {visibleSeries.length
                    ? "Choose one equipment profile to chart a comparable series."
                    : "No eligible points. Review equipment conventions or change the date range."}
                </Empty>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date / source</th>
                      <th>Best set</th>
                      <th>e1RM</th>
                      <th>Working sets</th>
                      <th>Volume load</th>
                      <th>Mean RPE</th>
                      <th>Order</th>
                      <th>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSeries.map((p) => (
                      <tr key={p.workoutId}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelectedWorkout(p.workoutId);
                              navigate("workouts");
                            }}
                          >
                            {p.date}
                          </button>
                        </td>
                        <td>
                          {p.load} kg × {p.reps}
                        </td>
                        <td>{fmt(p.value, 1)} kg</td>
                        <td>{p.sets}</td>
                        <td>{fmt(p.volume)} kg·reps</td>
                        <td>{fmt(p.rpe, 1)}</td>
                        <td>{p.order}</td>
                        <td>
                          {profiles.find((x) => x.id === p.profileId)?.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>What changed? · comparable observations</summary>
                {visibleSeries.length >= 6 &&
                new Set(visibleSeries.map((p) => p.profileId)).size === 1 ? (
                  (() => {
                    const first = visibleSeries.slice(0, 3),
                      last = visibleSeries.slice(-3);
                    return (
                      <p>
                        First three vs last three sessions: mean best-set load{" "}
                        {fmt(mean(first.map((p) => p.load!)), 1)} →{" "}
                        {fmt(mean(last.map((p) => p.load!)), 1)} kg; reps{" "}
                        {fmt(mean(first.map((p) => p.reps!)), 1)} →{" "}
                        {fmt(mean(last.map((p) => p.reps!)), 1)}. Reported RPE{" "}
                        {fmt(
                          mean(
                            first.flatMap((p) =>
                              p.rpe === null ? [] : [p.rpe],
                            ),
                          ),
                          1,
                        )}{" "}
                        →{" "}
                        {fmt(
                          mean(
                            last.flatMap((p) =>
                              p.rpe === null ? [] : [p.rpe],
                            ),
                          ),
                          1,
                        )}
                        . This is recorded performance, not evidence of a causal
                        training effect. Set type, technique and exercise order
                        may differ; inspect source rows.
                      </p>
                    );
                  })()
                ) : (
                  <p>
                    At least six sessions in one reviewed profile are needed for
                    this descriptive comparison.
                  </p>
                )}
              </details>
            </Panel>
            <Panel title="Exposure and source coverage">
              <p className="footnote">
                This table covers all imported history. The chart above uses the
                selected dates.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exercise / stable ID</th>
                      <th>Appearances</th>
                      <th>Working sets</th>
                      <th>Last recorded</th>
                      <th>Days since exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelectedExercise(e.id);
                              setProfileId("all");
                            }}
                          >
                            {e.name}
                          </button>
                          <small>{e.id}</small>
                        </td>
                        <td>{e.sessions}</td>
                        <td>{e.sets}</td>
                        <td>{e.last}</td>
                        <td>{daysBetween(e.last, today)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        );
      case "workouts": {
        const list = filtered.filter((w) =>
          (
            w.title +
            " " +
            w.description +
            " " +
            w.exercises.map((e) => e.title + " " + e.notes).join(" ")
          )
            .toLowerCase()
            .includes(search.toLowerCase()),
        );
        const w = workouts.find((w) => w.id === selectedWorkout),
          c = workouts.find((w) => w.id === compareWorkout);
        const detail = (w: Workout) => (
          <div className="workout-detail">
            <p className="eyebrow">
              {dateKey(w.start_time)} · {fmt(duration(w))} MIN ELAPSED
            </p>
            <h3>{w.title}</h3>
            <p>{w.description}</p>
            {w.exercises.map((e) => (
              <div key={e.index} className="exercise-detail">
                <h4>
                  {e.index + 1}. {e.title}{" "}
                  {e.superset_id !== null && (
                    <span className="pill">Superset {e.superset_id}</span>
                  )}
                </h4>
                {e.notes && <p className="muted">{e.notes}</p>}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Set / type</th>
                        <th>Load</th>
                        <th>Reps</th>
                        <th>RPE</th>
                        <th>Distance / duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.sets.map((s) => (
                        <tr key={s.index}>
                          <td>
                            {s.index + 1} · {s.type}
                          </td>
                          <td>{fmt(s.weight_kg, 1)} kg</td>
                          <td>{fmt(s.reps)}</td>
                          <td>{fmt(s.rpe, 1)}</td>
                          <td>
                            {fmt(s.distance_meters)} m /{" "}
                            {fmt(s.duration_seconds)} s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
        return (
          <>
            <div className="explorer-controls">
              <label className="search">
                <Search size={17} />
                <input
                  placeholder="Search sessions, exercises or notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                onClick={() =>
                  download("training-lens-workouts.json", {
                    source: "hevy",
                    exported_at: new Date().toISOString(),
                    workouts: list,
                  })
                }
              >
                <Download size={16} />
                Export selection
              </button>
            </div>
            <Panel title="Your recorded sessions">{recent(list)}</Panel>
            {w && (
              <Panel
                title="Session detail & comparison"
                aside={
                  <select
                    aria-label="Compare workout"
                    value={compareWorkout}
                    onChange={(e) => setCompareWorkout(e.target.value)}
                  >
                    <option value="">Choose another session</option>
                    {workouts
                      .filter((x) => x.id !== w.id)
                      .sort((a, b) => b.start_time.localeCompare(a.start_time))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {dateKey(x.start_time)} · {x.title}
                        </option>
                      ))}
                  </select>
                }
              >
                {c && (
                  <p className="callout">
                    {
                      w.exercises.filter((e) =>
                        c.exercises.some(
                          (x) =>
                            x.exercise_template_id === e.exercise_template_id,
                        ),
                      ).length
                    }{" "}
                    overlapping exercise IDs. Compare equipment, reps, effort
                    and order below; routine names do not establish equivalence.
                  </p>
                )}
                <div className={c ? "two-col" : ""}>
                  {detail(w)}
                  {c && detail(c)}
                </div>
              </Panel>
            )}
          </>
        );
      }
      case "distribution": {
        const list = exerciseList(filtered);
        const maps = entries.filter((e) => e.kind === "mapping");
        return (
          <>
            <Panel
              title="Where the work went"
              eyebrow="DIRECT RECORDED WORKING SETS"
              aside={
                <button onClick={() => setEditor({ kind: "mapping" })}>
                  <Plus size={16} />
                  Edit a mapping
                </button>
              }
            >
              <Chart
                kind="bar"
                metric="sets"
                unit="Working sets"
                data={list
                  .slice(0, 12)
                  .map((x) => ({ label: x.name, sets: x.sets }))}
              />
              <p className="footnote">
                Counts describe recorded sets. They do not measure muscle growth
                or identify deficiencies.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Working sets</th>
                      <th>Movement / direct muscle · user mapping</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((x) => (
                      <tr key={x.id}>
                        <td>{x.name}</td>
                        <td>{x.sets}</td>
                        <td>
                          {maps.find((m) => m.data.exerciseId === x.id)?.data
                            .name ?? "Unmapped — no muscle estimate"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        );
      }
      case "blocks":
        return (
          <>
            <Panel
              title="Compare chapters, with context"
              eyebrow="USER-DEFINED TRAINING BLOCKS"
              aside={
                <button onClick={() => setEditor({ kind: "block" })}>
                  <Plus size={16} />
                  New block
                </button>
              }
            >
              <p className="muted">
                Select up to two blocks. Frequency accounts for block length.
                These uncontrolled records cannot rank programmes.
              </p>
              <div className="block-list">
                {blocks.map((b) => (
                  <div className="block-card" key={b.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={compareBlocks.includes(b.id)}
                        onChange={(e) =>
                          setCompareBlocks(
                            e.target.checked
                              ? [...compareBlocks.slice(-1), b.id]
                              : compareBlocks.filter((x) => x !== b.id),
                          )
                        }
                      />
                      <h3>{b.data.name}</h3>
                    </label>
                    <p>
                      {b.data.start} → {b.data.end}
                      {b.data.end > today ? " · incomplete / future dates" : ""}
                    </p>
                    <p>{b.data.notes}</p>
                    <button
                      onClick={() => setEditor({ kind: "block", entry: b })}
                    >
                      Edit block
                    </button>
                  </div>
                ))}
              </div>
              {!blocks.length && (
                <Empty>
                  Create a named block with dates and your own context.
                </Empty>
              )}
              {compareBlocks.length === 2 &&
                (() => {
                  const bs = compareBlocks.map((id) =>
                    blocks.find((b) => b.id === id)!,
                  );
                  const ss = bs.map((b) =>
                    summary(
                      workouts,
                      b.data.start,
                      b.data.end > today ? today : b.data.end,
                    ),
                  );
                  const overlap = exerciseList(ss[0].workouts).filter((e) =>
                    exerciseList(ss[1].workouts).some((x) => x.id === e.id),
                  );
                  return (
                    <>
                      <table>
                        <thead>
                          <tr>
                            <th>Calculated metric</th>
                            {bs.map((b) => (
                              <th key={b.id}>{b.data.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["Sessions", ...ss.map((s) => s.sessions)],
                            [
                              "Sessions / week",
                              ...ss.map((s) => fmt(s.frequency, 1)),
                            ],
                            [
                              "Working sets / week",
                              ...ss.map((s, i) =>
                                fmt(
                                  (s.working * 7) /
                                    Math.max(
                                      1,
                                      daysBetween(
                                        bs[i].data.start,
                                        bs[i].data.end > today
                                          ? today
                                          : bs[i].data.end,
                                      ) + 1,
                                    ),
                                  1,
                                ),
                              ),
                            ],
                            [
                              "Mean elapsed minutes",
                              ...ss.map((s) => fmt(s.duration)),
                            ],
                          ].map((row, i) => (
                            <tr key={i}>
                              {row.map((x, j) => (
                                <td key={j}>{x}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <h3>{overlap.length} overlapping exercises</h3>
                      {overlap.map((e) => (
                        <button
                          className="text-button"
                          key={e.id}
                          onClick={() => {
                            setSelectedExercise(e.id);
                            navigate("exercises");
                          }}
                        >
                          {e.name} · inspect profile and set evidence{" "}
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </>
                  );
                })()}
            </Panel>
            <Panel
              title="Your context timeline"
              aside={
                <button onClick={() => setEditor({ kind: "annotation" })}>
                  <Plus size={16} />
                  Add context
                </button>
              }
            >
              {annotations.map((a) => (
                <div className="context-row" key={a.id}>
                  <div className="timeline-dot" />
                  <div>
                    <small>
                      {a.data.start} → {a.data.end || a.data.start} ·
                      user-entered context
                    </small>
                    <h3>{a.data.name}</h3>
                    <p>{a.data.notes}</p>
                    {a.data.exerciseId && (
                      <small>
                        Exercise:{" "}
                        {exercises.find((e) => e.id === a.data.exerciseId)
                          ?.name ?? a.data.exerciseId}
                      </small>
                    )}
                  </div>
                  <button
                    onClick={() => setEditor({ kind: "annotation", entry: a })}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {!annotations.length && (
                <Empty>Add context without changing your Hevy records.</Empty>
              )}
            </Panel>
          </>
        );
      case "goals":
        return (
          <>
            <Panel
              title="Progress with a destination"
              eyebrow="PERSONAL GOALS"
              aside={
                <button onClick={() => setEditor({ kind: "goal" })}>
                  <Plus size={16} />
                  New goal
                </button>
              }
            >
              {goalCards()}
            </Panel>
            <Panel
              title="A forecast that shows its working"
              eyebrow="ESTIMATE · NOT A PROMISE"
            >
              <div className="explorer-controls">
                <label>
                  Exercise
                  <select
                    value={exerciseId}
                    onChange={(e) => {
                      setSelectedExercise(e.target.value);
                      setProfileId("all");
                    }}
                  >
                    {exercises.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Equipment
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                  >
                    <option value="all">All reviewed profiles</option>
                    {profiles
                      .filter((p) => p.exerciseId === exerciseId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Horizon
                  <select
                    value={horizon}
                    onChange={(e) => setHorizon(Number(e.target.value))}
                  >
                    {[7, 14, 28, 42].map((n) => (
                      <option key={n} value={n}>
                        {n} days
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {prediction.eligible ? (
                <>
                  <div className="forecast-value">
                    {fmt(prediction.predicted, 1)} <span>kg estimated 1RM</span>
                  </div>
                  <p>
                    {prediction.model} · target {prediction.targetDate} ·{" "}
                    {prediction.n} observations
                  </p>
                  <p>{prediction.reason}</p>
                  <p className="muted">
                    Holdout MAE: {fmt(prediction.mae, 1)} kg; no-change MAE:{" "}
                    {fmt(prediction.baselineMae, 1)} kg. Heuristic variation
                    envelope {fmt(prediction.low, 1)}–{fmt(prediction.high, 1)}{" "}
                    kg. This is not a calibrated confidence interval. Load
                    increments apply to actual load goals, not to this e1RM
                    estimate.
                  </p>
                  <button
                    onClick={() =>
                      void save("snapshot", {
                        name: `${exercises.find((e) => e.id === exerciseId)?.name} · ${prediction.targetDate}`,
                        exerciseId,
                        profileId: selectedSeries.at(-1)?.profileId,
                        profile: profiles.find(
                          (p) => p.id === selectedSeries.at(-1)?.profileId,
                        ),
                        forecast: prediction,
                        assumptions:
                          "Same reviewed profile, 1–10 reps; no frequency intervention assumed.",
                        created: new Date().toISOString(),
                      })
                        .then(() => setNotice("Forecast snapshot saved."))
                        .catch((e) => setNotice(e.message))
                    }
                  >
                    <Check size={16} />
                    Save prediction snapshot
                  </button>
                </>
              ) : (
                <Empty>Not currently estimable. {prediction.reason}</Empty>
              )}
              <details>
                <summary>Forecast method & limitations</summary>
                <p>
                  Median pairwise slopes (Theil–Sen) with chronological holdout
                  of three observations. Minimum eight sessions across 42 days,
                  within the last 120 days. The no-change baseline wins unless
                  trend has lower holdout MAE. Sparse, changed-equipment or
                  stale histories are ineligible. Three holdouts are limited
                  evidence and do not establish calibrated reliability.
                </p>
              </details>
            </Panel>
            <Panel
              title="Does the prediction deserve trust?"
              eyebrow="SAVED SNAPSHOTS"
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prediction</th>
                      <th>Status</th>
                      <th>Observed − predicted</th>
                      <th>Baseline error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries
                      .filter((e) => e.kind === "snapshot")
                      .map((s) => {
                        const ps = exerciseSeries(
                          workouts,
                          s.data.exerciseId,
                          profiles,
                        ).filter((p) => p.profileId === s.data.profileId);
                        const result =
                          JSON.stringify(s.data.profile) !==
                          JSON.stringify(
                            profiles.find((p) => p.id === s.data.profileId),
                          )
                            ? {
                                status:
                                  "Equipment rules revised — create a new snapshot",
                                error: undefined,
                                baselineError: undefined,
                              }
                            : evaluate(
                                s.data.forecast as Forecast,
                                ps,
                                workouts,
                              );
                        return (
                          <tr key={s.id}>
                            <td>
                              {s.data.name}
                              <small>
                                Cutoff {s.data.forecast.cutoff} ·{" "}
                                {s.data.forecast.version}
                              </small>
                            </td>
                            <td>{result.status}</td>
                            <td>{fmt(result.error, 1)} kg</td>
                            <td>{fmt(result.baselineError, 1)} kg</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <p className="footnote">
                Target is fixed when saved: first eligible observation within 14
                days on/after the target date. Negative error means
                overprediction. Pre-cutoff source revisions invalidate scoring.
                Insufficient completed snapshots means reliability is not
                established.
              </p>
            </Panel>
          </>
        );
      case "reviews":
        return (
          <>
            <Panel
              title="A moment to reflect"
              eyebrow="RULE-BASED WEEKLY REVIEW"
            >
              {weeklyReview()}
            </Panel>
            <Panel title="Context recorded this week">
              {annotations
                .filter(
                  (a) =>
                    a.data.start <= end &&
                    (a.data.end || a.data.start) >= weekKey(end),
                )
                .map((a) => (
                  <div className="context-row" key={a.id}>
                    <div>
                      <h3>{a.data.name}</h3>
                      <p>{a.data.notes}</p>
                    </div>
                  </div>
                ))}
              <p className="footnote">
                Generated from current records with {VERSION}. Later Hevy edits
                can change this review. No annotation text is sent to an AI
                service.
              </p>
            </Panel>
          </>
        );
      case "methods":
        return (
          <>
            <div className="quality-banner">
              <ShieldCheck size={28} />
              <div>
                <h2>Evidence first. Assumptions visible.</h2>
                <p>
                  {mode === "demo"
                    ? "Synthetic example data only."
                    : "Source: Hevy · completed workouts only."}{" "}
                  No readiness, injury-risk or muscle-growth scores.
                </p>
              </div>
            </div>
            <div className="two-col">
              <Panel title="Source coverage">
                <dl>
                  <dt>Imported workouts</dt>
                  <dd>{workouts.length}</dd>
                  <dt>Recorded sets</dt>
                  <dd>{q.sets}</dd>
                  <dt>First / latest date</dt>
                  <dd>
                    {workouts.length
                      ? [...workouts]
                          .map((w) => dateKey(w.start_time))
                          .sort()[0] +
                        " / " +
                        [...workouts]
                          .map((w) => dateKey(w.start_time))
                          .sort()
                          .at(-1)
                      : "No records"}
                  </dd>
                  <dt>Missing load / reps</dt>
                  <dd>
                    {q.missingWeight} / {q.missingReps}
                  </dd>
                  <dt>Flagged set records</dt>
                  <dd>{q.invalid}</dd>
                  <dt>RPE coverage in filter</dt>
                  <dd>
                    {stats.rpeCoverage === null
                      ? "Unavailable"
                      : fmt(stats.rpeCoverage * 100) + "%"}
                  </dd>
                  <dt>Reviewed profiles</dt>
                  <dd>{profiles.filter((p) => p.reviewed).length}</dd>
                </dl>
                <p className="footnote">
                  Coverage is imported history, not your lifetime. Missing
                  values stay missing. Suspicious values remain in source
                  records for review.
                </p>
              </Panel>
              <Panel title="Sync health">
                <dl>
                  <dt>Last attempt</dt>
                  <dd>{sync?.last_attempt ?? "Not connected"}</dd>
                  <dt>Last successful sync</dt>
                  <dd>{sync?.last_success ?? "Not connected"}</dd>
                  <dt>Last full reconciliation</dt>
                  <dd>{sync?.last_full ?? "Not connected"}</dd>
                  <dt>Last error</dt>
                  <dd>{sync?.error ?? "None recorded"}</dd>
                </dl>
                <p className="muted">
                  {mode === "local"
                    ? "File mode has no scheduled sync. Open an updated export to refresh records. Optional cloud mode: "
                    : ""}
                  Daily at 9:17 pm Melbourne time. Incremental events with a
                  five-minute overlap; full reconciliation every seven days.
                  Data changes commit atomically after all pages succeed.
                </p>
              </Panel>
            </div>
            <Panel title="How this is calculated">
              {[
                [
                  "Recorded facts",
                  "Sessions, individual sets, load, reps and reported RPE come from Hevy. Session time is elapsed time and includes breaks.",
                ],
                [
                  "Working sets",
                  "Normal, failure and dropset entries count; warmups and unknown types do not. Dropsets are recorded counts, not equivalent stimulus.",
                ],
                [
                  "Volume load",
                  "External kg × reps, where both are known. Zero load remains zero. No doubling, bodyweight additions or cross-machine equivalence.",
                ],
                [
                  "Estimated strength",
                  "Epley kg × (1 + reps / 30), 1–10 reps and positive load; one rep uses recorded load. Reviewed external-load equipment only.",
                ],
                [
                  "Equipment & mapping",
                  "Stable exercise IDs are retained. Profiles use effective dates; most recent start takes precedence. Mapping labels never silently merge exercises.",
                ],
                [
                  "Interpretation",
                  "Comparisons describe observations and cannot establish physiology or causation. Partial periods are labelled; there are no arbitrary plateau scores.",
                ],
                [
                  "Forecasts",
                  "Chronological holdout, baseline comparison and explicit eligibility. Forecast errors and source revision status are visible in Goals & forecasts.",
                ],
              ].map(([title, text]) => (
                <details key={title}>
                  <summary>{title}</summary>
                  <p>{text}</p>
                </details>
              ))}
            </Panel>
          </>
        );
      case "settings":
        return (
          <>
            <Panel title="Make it yours" eyebrow="DISPLAY & PRIVACY">
              <div className="settings-row">
                <div>
                  <h3>Appearance</h3>
                  <p>Only your theme preference is stored on this browser.</p>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                  Switch to {theme === "dark" ? "light" : "dark"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <h3>Export dashboard context</h3>
                  <p>
                    Blocks, goals, equipment, mappings, annotations and
                    snapshots.
                  </p>
                </div>
                <button
                  onClick={() =>
                    download("training-lens-context.json", {
                      version: VERSION,
                      exported_at: new Date().toISOString(),
                      entries,
                    })
                  }
                >
                  <Download size={16} />
                  Export JSON
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <h3>Account & storage</h3>
                  <p>
                    {mode !== "private"
                      ? "Changes are held in memory and reset when you leave. Export dashboard context before leaving."
                      : "Sessions and personal response data stay in memory. Signing out clears the dashboard."}
                  </p>
                </div>
                <button
                  onClick={() => {
                    clear();
                    void backend?.auth.signOut();
                  }}
                >
                  Leave{" "}
                  {mode === "demo"
                    ? "demo"
                    : mode === "local"
                      ? "local file"
                      : "account"}
                </button>
              </div>
            </Panel>
            <Panel title="Priority exercises">
              <p className="muted">
                Choose up to four exercises for your overview.
              </p>
              <div className="priority-options">
                {exercises.map((ex) => (
                  <label className="check-label" key={ex.id}>
                    <input
                      type="checkbox"
                      checked={priorityIds.includes(ex.id)}
                      disabled={
                        !priorityIds.includes(ex.id) && priorityIds.length >= 4
                      }
                      onChange={(e) =>
                        void save(
                          "settings",
                          {
                            ...settingsEntry?.data,
                            priorityIds: e.target.checked
                              ? [...priorityIds, ex.id]
                              : priorityIds.filter((id) => id !== ex.id),
                          },
                          settingsEntry?.id,
                        ).catch((e) => setNotice(e.message))
                      }
                    />
                    {ex.name}
                  </label>
                ))}
              </div>
            </Panel>
            <Panel
              title="Equipment conventions"
              aside={
                <button onClick={() => setEditor({ kind: "equipment" })}>
                  <Plus size={16} />
                  Add profile
                </button>
              }
            >
              {profiles.map((p) => (
                <div className="settings-row" key={p.id}>
                  <div>
                    <h3>{p.name}</h3>
                    <p>
                      {exercises.find((e) => e.id === p.exerciseId)?.name} ·{" "}
                      {p.mode} · {p.increment} kg increments ·{" "}
                      {p.reviewed ? "Reviewed" : "Unresolved"}
                    </p>
                    <small>
                      {p.start} → {p.end || "present"} · {p.convention}
                    </small>
                  </div>
                  <button
                    onClick={() =>
                      setEditor({
                        kind: "equipment",
                        entry: entries.find((e) => e.id === p.id),
                      })
                    }
                  >
                    Edit
                  </button>
                </div>
              ))}
              {!profiles.length && (
                <Empty>
                  Review exercise-specific conventions before estimated strength
                  or forecasts become available.
                </Empty>
              )}
            </Panel>
            <Panel title="Movement mappings">
              {entries
                .filter((e) => e.kind === "mapping")
                .map((m) => (
                  <div key={m.id} className="settings-row">
                    <p>
                      {exercises.find((e) => e.id === m.data.exerciseId)?.name}{" "}
                      → {m.data.name}
                    </p>
                    <button
                      onClick={() => setEditor({ kind: "mapping", entry: m })}
                    >
                      Edit mapping
                    </button>
                  </div>
                ))}
            </Panel>
          </>
        );
      default:
        return null;
    }
  }
  if (recovery)
    return (
      <div className="login-screen">
        <div className="login-content">
          <h1>Reset your password.</h1>
          <Auth
            configured={!!backend}
            notice={notice}
            recovery
            onDone={() => setRecovery(false)}
            onNotice={setNotice}
          />
        </div>
      </div>
    );
  if (mode === "login")
    return (
      <div className="login-screen">
        <div className="login-brand">
          <Dumbbell size={34} />
          <span>
            Training Lens<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-content">
          <span className="eyebrow">YOUR TRAINING, UNDERSTOOD.</span>
          <h1>
            The bigger picture
            <br />
            behind every rep<span className="brand-dot">.</span>
          </h1>
          <p>
            A private space to explore your progress, connect the dots, and
            train with a little more clarity.
          </p>
          <Auth
            configured={!!backend}
            notice={notice}
            recovery={recovery}
            onDone={() => setRecovery(false)}
            onNotice={setNotice}
          />
          <button className="demo-button" onClick={() => void demo()}>
            Explore the synthetic demo <ArrowRight size={17} />
          </button>
          <button
            className="primary local-import-button"
            onClick={() => localFileInput.current?.click()}
          >
            Open my Hevy export <Download size={17} />
          </button>
          <input
            type="file"
            hidden
            ref={localFileInput}
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void openLocalExport(file);
            }}
          />
          <p className="footnote">
            Free file mode · choose your Hevy JSON export. Records stay on this
            device for this session.
          </p>
          <small>
            <ShieldCheck size={14} />
            Hevy workout data · No account needed for file mode
          </small>
        </div>
        <div className="login-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
          <div className="art-label">
            CONSISTENCY
            <br />
            <strong>BEFORE INTENSITY.</strong>
          </div>
          <div className="art-bars">
            {[28, 44, 39, 56, 49, 65, 61, 78, 69, 88, 82, 100].map((h, i) => (
              <i style={{ height: h + "%" }} key={i} />
            ))}
          </div>
          <p>Make sense of the work you put in.</p>
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <input
        type="file"
        hidden
        ref={localFileInput}
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void openLocalExport(file);
        }}
      />
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <div className="brand">
          <Dumbbell size={26} />
          <span>
            Training Lens<span className="brand-dot">.</span>
          </span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon {...iconProps} />
              {label}
              {page === id && <span className="nav-marker" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={17} />
            <div>
              Private by design
              <small>
                {mode === "demo"
                  ? "Synthetic data workspace"
                  : mode === "local"
                    ? "Local export · session only"
                    : "Owner access only"}
              </small>
            </div>
          </div>
          <button
            className="profile-button"
            onClick={() => {
              clear();
              void backend?.auth.signOut();
            }}
          >
            <span className="avatar">{mode === "demo" ? "D" : "S"}</span>
            <span>
              {mode === "demo"
                ? "Demo workspace"
                : mode === "local"
                  ? "Local export"
                  : "Your workspace"}
              <small>
                {mode !== "private"
                  ? "Changes stay in memory"
                  : "Connected to Supabase"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-badge">
              {mode === "demo"
                ? "SYNTHETIC DEMO"
                : mode === "local"
                  ? "LOCAL HEVY EXPORT"
                  : "PRIVATE ACCOUNT"}
            </span>
            <button
              className="icon-button"
              aria-label="Toggle colour theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "overview"
                  ? "LET’S LOOK AT THE BIGGER PICTURE"
                  : "YOUR TRAINING, UNDERSTOOD"}
              </p>
              <h1>
                {page === "overview"
                  ? "Training, understood."
                  : nav.find((n) => n[0] === page)?.[1]}
                {page === "overview" && <span className="heading-dot">✳</span>}
              </h1>
              <p className="muted">
                {page === "overview"
                  ? "Your effort, your progress, and the context that connects them."
                  : "Recorded evidence. Clear methods. Your context."}
              </p>
            </div>
            <button
              className="sync-button"
              disabled={busy || loading}
              onClick={() => void syncNow()}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              {busy
                ? "Syncing…"
                : mode === "local"
                  ? "Open updated export"
                  : "Sync now"}
            </button>
          </div>
          <div className="filterbar">
            <div className="range-buttons">
              {[
                ["4 weeks", 27],
                ["12 weeks", 83],
                ["6 months", 181],
              ].map(([label, n]) => (
                <button
                  className={daysBetween(start, end) === n ? "selected" : ""}
                  key={label}
                  onClick={() => {
                    setStart(dayAdd(today, -Number(n)));
                    setEnd(today);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className={
                  workouts.length &&
                  start ===
                    [...workouts].map((w) => dateKey(w.start_time)).sort()[0]
                    ? "selected"
                    : ""
                }
                onClick={() => {
                  setStart(
                    workouts.length
                      ? [...workouts]
                          .map((w) => dateKey(w.start_time))
                          .sort()[0]
                      : today,
                  );
                  setEnd(today);
                }}
              >
                All time
              </button>
            </div>
            <div className="date-inputs">
              <CalendarDays size={15} />
              <input
                type="date"
                aria-label="Global start date"
                value={start}
                max={end}
                onChange={(e) =>
                  e.target.value &&
                  e.target.value <= end &&
                  setStart(e.target.value)
                }
              />
              <span>—</span>
              <input
                type="date"
                aria-label="Global end date"
                value={end}
                min={start}
                max={today}
                onChange={(e) =>
                  e.target.value &&
                  e.target.value >= start &&
                  setEnd(e.target.value)
                }
              />
            </div>
          </div>
          <div className="sync-status">
            <span>
              <i className={mode === "demo" ? "demo-dot" : "status-dot"} />
              {mode === "demo"
                ? "Synthetic example · fixed reference date 21 Oct 2026"
                : mode === "local"
                  ? "Local export · no automatic sync"
                  : sync?.last_success
                    ? "Last successful sync " +
                      new Date(sync.last_success).toLocaleString("en-AU", {
                        timeZone: "Australia/Melbourne",
                      })
                    : "No successful sync recorded"}
            </span>
            <button className="text-button" onClick={() => navigate("methods")}>
              How is this calculated? <ArrowUpRight size={13} />
            </button>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? <Empty>Loading private records…</Empty> : renderPage()}
          <footer>
            Training Lens · Personal workspace{" "}
            <span>
              Australia/Melbourne · {VERSION} ·{" "}
              {mode === "demo" ? "Synthetic data" : "Hevy source data"}
            </span>
          </footer>
        </div>
      </main>
      {editor && (
        <Editor
          kind={editor.kind}
          entry={editor.entry}
          exercises={exercises}
          profiles={profiles}
          today={today}
          onClose={() => setEditor(null)}
          onSave={async (data) => {
            await save(editor.kind, data, editor.entry?.id);
            setEditor(null);
          }}
          onDelete={
            editor.entry
              ? async () => {
                  await remove(editor.entry!);
                  setEditor(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
function Auth({
  configured,
  notice,
  recovery,
  onNotice,
  onDone,
}: {
  configured: boolean;
  notice: string;
  recovery: boolean;
  onNotice: (s: string) => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!backend) return;
    setBusy(true);
    try {
      const result = recovery
        ? await backend.auth.updateUser({ password })
        : await backend.auth.signInWithPassword({ email, password });
      if (result.error) throw Error(result.error.message);
      if (recovery) {
        onDone();
        onNotice("Password updated.");
      }
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {!configured && (
        <p className="setup-note">
          Open a local export or explore the demo for free. Cloud account access
          is optional and is not configured.
        </p>
      )}
      {configured && (
        <>
          {!recovery && (
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label>
            {recovery ? "New password" : "Password"}
            <input
              type="password"
              minLength={recovery ? 12 : 1}
              autoComplete={recovery ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : recovery
                ? "Update password"
                : "Sign in to your workspace"}
            <ArrowRight size={16} />
          </button>
          {!recovery && (
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                if (!email) {
                  onNotice("Enter your email first.");
                  return;
                }
                const { error } = await backend!.auth.resetPasswordForEmail(
                  email,
                  { redirectTo: location.origin + import.meta.env.BASE_URL },
                );
                onNotice(
                  error
                    ? "Recovery request failed. Please try again."
                    : "If the account exists, a recovery email has been requested.",
                );
              }}
            >
              Forgot password?
            </button>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
function Editor({
  kind,
  entry,
  exercises,
  profiles,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  kind: MetaKind;
  entry?: Entry;
  exercises: ReturnType<typeof exerciseList>;
  profiles: Profile[];
  today: string;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<any>(
      entry?.data ?? {
        name: "",
        start: today,
        end: kind === "block" ? today : "",
        notes: "",
        exerciseId: exercises[0]?.id ?? "",
        profileId: profiles[0]?.id ?? "",
        metric: "e1rm",
        target: 80,
        reps: 5,
        increment: 2.5,
        mode: "external",
        reviewed: false,
        convention: "",
      },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const field = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label>
      {label}
      <input
        type={type}
        required={required}
        value={data[key] ?? ""}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        onChange={(e) =>
          setData({
            ...data,
            [key]:
              type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
          })
        }
      />
    </label>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (data.end && data.start > data.end) {
      setError("End date must be on or after start date.");
      return;
    }
    if (kind === "equipment" && (!data.increment || !data.convention.trim())) {
      setError("Enter a positive load increment and explicit convention.");
      return;
    }
    if (kind === "goal" && (!data.target || !data.profileId)) {
      setError("Enter a positive goal and compatible equipment profile.");
      return;
    }
    if (kind === "goal" && data.metric === "load") {
      const profile = profiles.find((p) => p.id === data.profileId);
      if (
        !Number.isInteger(data.reps) ||
        data.reps < 1 ||
        (data.rpeMax != null && (data.rpeMax < 0 || data.rpeMax > 10))
      ) {
        setError("Use whole positive reps and RPE from 0 to 10.");
        return;
      }
      if (
        !profile ||
        profile.mode !== "external" ||
        Math.abs(
          data.target / profile.increment -
            Math.round(data.target / profile.increment),
        ) > 1e-7
      ) {
        setError(
          "Choose external-load equipment and a target compatible with its load increment.",
        );
        return;
      }
    }
    setBusy(true);
    try {
      await onSave(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="editor-title">
      <form onSubmit={submit}>
        <div className="panel-head">
          <h2 id="editor-title">
            {entry ? "Edit" : "Add"} {kind}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {field(
          "name",
          kind === "mapping" ? "Movement / direct muscle label" : "Name",
          "text",
          true,
        )}
        {["equipment", "goal", "mapping", "annotation"].includes(kind) && (
          <label>
            Exercise {kind === "annotation" ? "(optional)" : ""}
            <select
              value={data.exerciseId}
              required={kind !== "annotation"}
              onChange={(e) =>
                setData({ ...data, exerciseId: e.target.value, profileId: "" })
              }
            >
              {kind === "annotation" && <option value="">All exercises</option>}
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind !== "mapping" && field("start", "Start date", "date", true)}
        {["block", "annotation", "equipment"].includes(kind) &&
          field("end", "End date (blank = ongoing)", "date", kind === "block")}
        {["block", "annotation"].includes(kind) && (
          <label>
            Notes
            <textarea
              rows={4}
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
            />
          </label>
        )}
        {kind === "equipment" && (
          <>
            <label>
              Load mode
              <select
                value={data.mode}
                onChange={(e) => setData({ ...data, mode: e.target.value })}
              >
                <option value="external">External load</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="assisted">Assistance</option>
              </select>
            </label>
            {field("increment", "Available increment · kg", "number", true)}
            <label>
              Equipment & logging convention
              <textarea
                required
                rows={3}
                value={data.convention}
                onChange={(e) =>
                  setData({ ...data, convention: e.target.value })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={data.reviewed}
                onChange={(e) =>
                  setData({ ...data, reviewed: e.target.checked })
                }
              />
              I reviewed load, reps, equipment and technique conventions.
            </label>
          </>
        )}
        {kind === "goal" && (
          <>
            <label>
              Equipment profile
              <select
                required
                value={data.profileId}
                onChange={(e) =>
                  setData({ ...data, profileId: e.target.value })
                }
              >
                <option value="">Choose a profile</option>
                {profiles
                  .filter((p) => p.exerciseId === data.exerciseId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Metric
              <select
                value={data.metric}
                onChange={(e) => setData({ ...data, metric: e.target.value })}
              >
                <option value="e1rm">Estimated 1RM · kg</option>
                <option value="load">External load at exact reps · kg</option>
                <option value="distance">Recorded set distance · m</option>
                <option value="duration">Recorded set duration · s</option>
              </select>
            </label>
            {field("target", "Target", "number", true)}
            {data.metric === "load" && (
              <>
                {field("reps", "Exact target reps", "number", true)}
                {field("rpeMax", "Optional maximum reported RPE", "number")}
              </>
            )}
            {field("deadline", "Optional deadline", "date")}
          </>
        )}
        {kind === "mapping" && (
          <p className="footnote">
            This versioned user label does not merge exercise identities or
            assign indirect fractional sets.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              disabled={busy}
              className="danger"
              onClick={() => void onDelete().catch((e) => setError(e.message))}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save " + kind}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export default App;
