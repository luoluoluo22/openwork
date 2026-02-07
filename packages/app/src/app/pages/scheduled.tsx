import { For, Show, createMemo, createSignal } from "solid-js";

import type { ScheduledJob } from "../types";
import { usePlatform } from "../context/platform";
import { formatRelativeTime, isTauriRuntime } from "../utils";
import { t, currentLocale } from "../../i18n";

import Button from "../components/button";
import {
  BookOpen,
  Brain,
  Calendar,
  Clock,
  FolderOpen,
  MessageSquare,
  Plus,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from "lucide-solid";

export type ScheduledTasksViewProps = {
  jobs: ScheduledJob[];
  source: "local" | "remote";
  sourceReady: boolean;
  status: string | null;
  busy: boolean;
  lastUpdatedAt: number | null;
  refreshJobs: (options?: { force?: boolean }) => void;
  deleteJob: (name: string) => Promise<void> | void;
  isWindows: boolean;
  activeWorkspaceRoot: string;
  createSessionAndOpen: () => void;
  setPrompt: (value: string) => void;
  newTaskDisabled: boolean;
};

const toRelative = (value?: string | null) => {
  const tr = (key: string) => t(key, currentLocale());
  if (!value) return tr("session.scheduled.never");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return tr("session.scheduled.never");
  return formatRelativeTime(parsed);
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const parseCronNumbers = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return [] as number[];
  const parts = trimmed.split(",");
  const values = new Set<number>();
  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;
    if (segment.includes("-")) {
      const [startRaw, endRaw] = segment.split("-");
      const start = Number.parseInt(startRaw ?? "", 10);
      const end = Number.parseInt(endRaw ?? "", 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let i = lo; i <= hi; i += 1) values.add(i);
      continue;
    }
    const num = Number.parseInt(segment, 10);
    if (!Number.isFinite(num)) continue;
    values.add(num);
  }
  return Array.from(values).sort((a, b) => a - b);
};

const humanizeCron = (cron: string) => {
  const tr = (key: string) => t(key, currentLocale());
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return tr("session.scheduled.cron_custom");
  const [minuteRaw, hourRaw, dom, mon, dowRaw] = parts;
  if (!minuteRaw || !hourRaw || !dom || !mon || !dowRaw) return tr("session.scheduled.cron_custom");

  // Every N hours
  if (minuteRaw === "0" && hourRaw.startsWith("*/") && dom === "*" && mon === "*" && dowRaw === "*") {
    const interval = Number.parseInt(hourRaw.slice(2), 10);
    if (Number.isFinite(interval) && interval > 0) {
      return interval === 1
        ? tr("session.scheduled.cron_every_hour")
        : tr("session.scheduled.cron_every_n_hours").replace("{n}", String(interval));
    }
  }

  // Daily / weekly at a fixed time
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return tr("session.scheduled.cron_custom");
  if (dom !== "*" || mon !== "*") return tr("session.scheduled.cron_custom");

  const timeLabel = `${pad2(hour)}:${pad2(minute)}`;

  if (dowRaw === "*") {
    return tr("session.scheduled.cron_every_day_at").replace("{time}", timeLabel);
  }

  const days = parseCronNumbers(dowRaw);
  const normalized = new Set(days.map((d) => (d === 7 ? 0 : d)));
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const weekdayDays = [1, 2, 3, 4, 5];
  const weekendDays = [0, 6];

  const includesAll = allDays.every((d) => normalized.has(d));
  if (includesAll) return tr("session.scheduled.cron_every_day_at").replace("{time}", timeLabel);

  const includesWeekdays = weekdayDays.every((d) => normalized.has(d)) && !weekendDays.some((d) => normalized.has(d));
  if (includesWeekdays) return tr("session.scheduled.cron_weekdays_at").replace("{time}", timeLabel);

  const includesWeekends = weekendDays.every((d) => normalized.has(d)) && !weekdayDays.some((d) => normalized.has(d));
  if (includesWeekends) return tr("session.scheduled.cron_weekends_at").replace("{time}", timeLabel);

  const labels: Record<number, string> = {
    0: tr("session.scheduled.sun"),
    1: tr("session.scheduled.mon"),
    2: tr("session.scheduled.tue"),
    3: tr("session.scheduled.wed"),
    4: tr("session.scheduled.thu"),
    5: tr("session.scheduled.fri"),
    6: tr("session.scheduled.sat"),
  };
  const list = Array.from(normalized)
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => labels[d] ?? String(d))
    .join(", ");
  if (!list) return tr("session.scheduled.cron_at").replace("{time}", timeLabel);
  return tr("session.scheduled.cron_days_at").replace("{days}", list).replace("{time}", timeLabel);
};

const taskSummary = (job: ScheduledJob) => {
  const tr = (key: string) => t(key, currentLocale());
  const run = job.run;
  if (run?.command) {
    const args = run.arguments ? ` ${run.arguments}` : "";
    return { label: tr("session.scheduled.label_command"), value: `${run.command}${args}`, mono: true };
  }
  const prompt = run?.prompt ?? job.prompt;
  if (prompt) {
    return { label: tr("session.scheduled.label_prompt"), value: prompt, mono: false };
  }
  return { label: tr("session.scheduled.label_task"), value: tr("session.scheduled.label_no_task"), mono: false };
};

const statusLabel = (status?: string | null) => {
  const tr = (key: string) => t(key, currentLocale());
  if (!status) return tr("session.scheduled.status_not_run");
  if (status === "running") return tr("session.scheduled.status_running");
  if (status === "success") return tr("session.scheduled.status_success");
  if (status === "failed") return tr("session.scheduled.status_failed");
  return status;
};

const statusTone = (status?: string | null) => {
  if (status === "success") return "border-emerald-7/60 bg-emerald-3/60 text-emerald-11";
  if (status === "failed") return "border-red-7/60 bg-red-3/60 text-red-11";
  if (status === "running") return "border-amber-7/60 bg-amber-3/60 text-amber-11";
  return "border-gray-6 bg-gray-2 text-gray-9";
};

const statusIconTone = (status?: string | null) => {
  if (status === "success") return "border-emerald-6 text-emerald-10";
  if (status === "failed") return "border-red-6 text-red-10";
  if (status === "running") return "border-amber-6 text-amber-10";
  return "border-gray-6 text-gray-9";
};

const automationTemplates = [
  {
    icon: Calendar,
    descriptionKey: "session.scheduled.template_scan_commits",
    promptKey: "session.scheduled.template_scan_commits_prompt",
    tone: "text-red-9",
  },
  {
    icon: BookOpen,
    descriptionKey: "session.scheduled.template_release_notes",
    promptKey: "session.scheduled.template_release_notes_prompt",
    tone: "text-blue-9",
  },
  {
    icon: MessageSquare,
    descriptionKey: "session.scheduled.template_git_summary",
    promptKey: "session.scheduled.template_git_summary_prompt",
    tone: "text-purple-9",
  },
  {
    icon: TrendingUp,
    descriptionKey: "session.scheduled.template_ci_failures",
    promptKey: "session.scheduled.template_ci_failures_prompt",
    tone: "text-indigo-9",
  },
  {
    icon: Trophy,
    descriptionKey: "session.scheduled.template_classic_game",
    promptKey: "session.scheduled.template_classic_game_prompt",
    tone: "text-amber-9",
  },
  {
    icon: Brain,
    descriptionKey: "session.scheduled.template_next_skills",
    promptKey: "session.scheduled.template_next_skills_prompt",
    tone: "text-pink-9",
  },
];

const dayOptions = [
  { id: "mo", label: "Mo", cron: "1" },
  { id: "tu", label: "Tu", cron: "2" },
  { id: "we", label: "We", cron: "3" },
  { id: "th", label: "Th", cron: "4" },
  { id: "fr", label: "Fr", cron: "5" },
  { id: "sa", label: "Sa", cron: "6" },
  { id: "su", label: "Su", cron: "0" },
];

const getDayLabel = (id: string, defaultLabel: string) => {
  const tr = (key: string) => t(key, currentLocale());
  const labels: Record<string, string> = {
    mo: tr("session.scheduled.mon"),
    tu: tr("session.scheduled.tue"),
    we: tr("session.scheduled.wed"),
    th: tr("session.scheduled.thu"),
    fr: tr("session.scheduled.fri"),
    sa: tr("session.scheduled.sat"),
    su: tr("session.scheduled.sun"),
  };
  return labels[id] ?? defaultLabel;
};

const normalizeSentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
};

const buildCronFromDaily = (timeValue: string, days: string[]) => {
  const [hour, minute] = timeValue.split(":");
  if (!hour || !minute) return "";
  const hourValue = Number.parseInt(hour, 10);
  const minuteValue = Number.parseInt(minute, 10);
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return "";
  if (!days.length) return "";
  if (days.length === dayOptions.length) {
    return `${minuteValue} ${hourValue} * * *`;
  }
  const daySpec = dayOptions
    .filter((day) => days.includes(day.id))
    .map((day) => day.cron)
    .join(",");
  if (!daySpec) return "";
  return `${minuteValue} ${hourValue} * * ${daySpec}`;
};

const buildCronFromInterval = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const interval = Math.max(1, Math.round(hours));
  return `0 */${interval} * * *`;
};

const buildAutomationPrompt = (options: {
  name: string;
  prompt: string;
  schedule: string;
  workdir: string;
}) => {
  const tr = (key: string) => t(key, currentLocale());
  const name = options.name.trim();
  const schedule = options.schedule.trim();
  const prompt = normalizeSentence(options.prompt);
  if (!schedule || !prompt) return "";
  const workdir = options.workdir.trim();

  let nameSegment = "";
  if (name) {
    if (currentLocale() === "zh") {
      nameSegment = name;
    } else {
      nameSegment = tr("session.scheduled.build_automation_name_segment").replace("{name}", name);
    }
  }

  const workdirSegment = workdir
    ? tr("session.scheduled.build_automation_workdir_segment").replace("{dir}", workdir)
    : "";

  return tr("session.scheduled.build_automation_prompt")
    .replace("{name}", nameSegment)
    .replace("{schedule}", schedule)
    .replace("{prompt}", prompt)
    .replace("{workdir}", workdirSegment)
    .trim();
};

const AutomationCard = (props: {
  icon: any;
  description: string;
  tone?: string;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      class={`group w-full rounded-2xl border bg-gray-1 p-5 text-left transition-shadow hover:shadow-md ${props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        } border-gray-4 hover:border-gray-5`}
    >
      <div class={`mb-4 flex h-8 w-8 items-center justify-center rounded-lg border border-gray-3 bg-gray-1 ${props.tone ?? ""
        }`}>
        <Icon size={18} />
      </div>
      <p class="text-[13px] text-gray-10 leading-relaxed group-hover:text-gray-12">{props.description}</p>
    </button>
  );
};

const AutomationJobCard = (props: {
  job: ScheduledJob;
  supported: boolean;
  busy: boolean;
  onDelete: () => void;
  onRun: () => void;
}) => {
  const summary = () => taskSummary(props.job);
  const status = () => props.job.lastRunStatus;
  const scheduleLabel = () => humanizeCron(props.job.schedule);
  return (
    <div class="flex flex-col gap-4 rounded-2xl border border-gray-4 bg-gray-1 p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div
            class={`flex h-8 w-8 items-center justify-center rounded-lg border bg-gray-1 ${statusIconTone(
              status()
            )}`}
          >
            <Calendar size={18} />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold text-gray-12 truncate">{props.job.name}</h3>
              <span
                class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(
                  status()
                )}`}
              >
                {statusLabel(status())}
              </span>
            </div>
            <div class="mt-1 text-xs text-gray-9">{scheduleLabel()}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onRun}
            disabled={props.busy}
            class={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${props.busy
              ? "border-gray-5 text-gray-8"
              : "border-gray-5 text-gray-10 hover:bg-gray-2/70 hover:text-gray-12"
              }`}
          >
            <Play size={12} />
            {t("session.scheduled.run", currentLocale())}
          </button>
          <button
            type="button"
            onClick={props.onDelete}
            disabled={!props.supported || props.busy}
            class={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${!props.supported || props.busy
              ? "border-gray-5 text-gray-8"
              : "border-red-6 text-red-10 hover:bg-red-3"
              }`}
          >
            <Trash2 size={12} />
            {t("session.scheduled.delete_confirm", currentLocale())}
          </button>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-gray-4 bg-gray-2/60 px-3 py-3">
          <div class="text-[10px] uppercase tracking-wide text-gray-8">{summary().label}</div>
          <div
            class={`mt-1 text-sm text-gray-12 break-words ${summary().mono ? "font-mono" : ""}`}
          >
            {summary().value}
          </div>
        </div>
        <div class="rounded-xl border border-gray-4 bg-gray-2/60 px-3 py-3 space-y-2">
          <div class="text-[10px] uppercase tracking-wide text-gray-8">{t("session.scheduled.run_context", currentLocale())}</div>
          <div class="space-y-2 text-xs text-gray-9">
            <div class="flex items-center gap-2">
              <FolderOpen size={14} class="text-gray-8" />
              <span class="font-mono text-gray-12 break-all">
                {props.job.workdir ?? t("session.scheduled.default", currentLocale())}
              </span>
            </div>
            <Show when={props.job.run?.attachUrl ?? props.job.attachUrl}>
              <div class="flex items-center gap-2">
                <Terminal size={14} class="text-gray-8" />
                <span class="font-mono text-gray-12 break-all">
                  {props.job.run?.attachUrl ?? props.job.attachUrl}
                </span>
              </div>
            </Show>
            <Show when={props.job.source}>
              <div class="text-[11px] text-gray-8">Source: {props.job.source}</div>
            </Show>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4 text-xs text-gray-9">
        <div class="flex items-center gap-1">
          <Clock size={12} />
          {t("session.scheduled.last_run", currentLocale())} {toRelative(props.job.lastRunAt)}
        </div>
        <div>{t("session.scheduled.created", currentLocale())} {toRelative(props.job.createdAt)}</div>
        <Show when={props.job.run?.agent}>
          <div>{t("session.scheduled.agent", currentLocale())} {props.job.run?.agent}</div>
        </Show>
        <Show when={props.job.run?.model}>
          <div>{t("session.scheduled.model", currentLocale())} {props.job.run?.model}</div>
        </Show>
      </div>
    </div>
  );
};

export default function ScheduledTasksView(props: ScheduledTasksViewProps) {
  const tr = (key: string) => t(key, currentLocale());
  const platform = usePlatform();
  const supported = createMemo(() => {
    if (props.source === "remote") return props.sourceReady;
    return isTauriRuntime() && !props.isWindows;
  });
  const supportNote = createMemo(() => {
    if (props.source === "remote") {
      return props.sourceReady ? null : tr("session.scheduled.support_remote_unavailable");
    }
    if (!isTauriRuntime()) return tr("session.scheduled.support_desktop_required");
    if (props.isWindows) return tr("session.scheduled.support_windows_unsupported");
    return null;
  });
  const sourceDescription = createMemo(() =>
    props.source === "remote"
      ? tr("session.scheduled.description_remote")
      : tr("session.scheduled.description_local")
  );
  const sourceLabel = createMemo(() =>
    props.source === "remote" ? "From OpenWork server" : "From local scheduler"
  );
  const schedulerLabel = createMemo(() => (props.source === "remote" ? "OpenWork server" : "Local"));
  const schedulerHint = createMemo(() =>
    props.source === "remote" ? "Remote instance" : "Launchd or systemd"
  );
  const schedulerUnavailableHint = createMemo(() =>
    props.source === "remote" ? "OpenWork server unavailable" : "Desktop-only"
  );
  const deleteDescription = createMemo(() =>
    props.source === "remote"
      ? tr("session.scheduled.delete_description_remote")
      : tr("session.scheduled.delete_description_local")
  );

  const lastUpdatedLabel = createMemo(() => {
    if (!props.lastUpdatedAt) return "Not synced yet";
    return formatRelativeTime(props.lastUpdatedAt);
  });

  const [deleteTarget, setDeleteTarget] = createSignal<ScheduledJob | null>(null);
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [automationName, setAutomationName] = createSignal(tr("session.scheduled.default_automation_name"));
  const [automationProject, setAutomationProject] = createSignal(props.activeWorkspaceRoot);
  const [automationPrompt, setAutomationPrompt] = createSignal(
    tr("session.scheduled.template_scan_commits_prompt")
  );
  const [scheduleMode, setScheduleMode] = createSignal<"daily" | "interval">("daily");
  const [scheduleTime, setScheduleTime] = createSignal("09:00");
  const [scheduleDays, setScheduleDays] = createSignal(["mo", "tu", "we", "th", "fr"]);
  const [intervalHours, setIntervalHours] = createSignal(6);

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await props.deleteJob(target.slug);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeleteError(message || "Failed to delete job.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const cronExpression = createMemo(() => {
    if (scheduleMode() === "interval") {
      return buildCronFromInterval(intervalHours());
    }
    return buildCronFromDaily(scheduleTime(), scheduleDays());
  });

  const createPromptValue = createMemo(() =>
    buildAutomationPrompt({
      name: automationName(),
      prompt: automationPrompt(),
      schedule: cronExpression(),
      workdir: automationProject(),
    })
  );

  const canCreateAutomation = createMemo(() => !!createPromptValue());

  const openSchedulerDocs = () => {
    platform.openLink("https://github.com/anomalyco/opencode-scheduler");
  };

  const openCreateModal = () => {
    const root = props.activeWorkspaceRoot.trim();
    if (!automationProject().trim() && root) {
      setAutomationProject(root);
    }
    setCreateModalOpen(true);
  };

  const launchAutomationPrompt = (promptValue: string) => {
    if (!promptValue) return;
    const root = props.activeWorkspaceRoot.trim();
    const decorated = root ? `${promptValue}\n\nRun from ${root}.` : promptValue;
    props.setPrompt(decorated);
    props.createSessionAndOpen();
  };

  const handleCreateAutomation = () => {
    const promptValue = createPromptValue();
    if (!promptValue) return;
    props.setPrompt(promptValue);
    props.createSessionAndOpen();
    setCreateModalOpen(false);
  };

  const runAutomationNow = (job: ScheduledJob) => {
    const run = job.run;
    const workdir = (job.workdir ?? props.activeWorkspaceRoot ?? "").trim();
    const schedule = humanizeCron(job.schedule);
    const workdirHint = workdir ? tr("session.scheduled.run_from").replace("{dir}", workdir) : "";

    if (run?.prompt || job.prompt) {
      const promptBody = (run?.prompt ?? job.prompt ?? "").trim();
      props.setPrompt(
        tr("session.scheduled.run_now_prompt")
          .replace("{name}", job.name)
          .replace("{schedule}", schedule)
          .replace("{body}", promptBody)
          .replace("{workdir}", workdirHint)
          .trim()
      );
      props.createSessionAndOpen();
      return;
    }

    if (run?.command) {
      const args = run.arguments ? ` ${run.arguments}` : "";
      const cmd = `${run.command}${args}`.trim();
      props.setPrompt(
        tr("session.scheduled.run_now_cmd_prompt")
          .replace("{name}", job.name)
          .replace("{schedule}", schedule)
          .replace("{cmd}", cmd)
          .replace("{workdir}", workdirHint)
          .trim()
      );
      props.createSessionAndOpen();
      return;
    }

    props.setPrompt(
      tr("session.scheduled.run_now_status_prompt")
        .replace("{name}", job.name)
        .replace("{schedule}", schedule)
    );
    props.createSessionAndOpen();
  };

  const toggleDay = (id: string) => {
    setScheduleDays((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return Array.from(next);
    });
  };

  const updateIntervalHours = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const bounded = Math.min(24, Math.max(1, parsed));
    setIntervalHours(bounded);
  };

  return (
    <section class="space-y-10">
      <div class="flex flex-wrap items-center justify-end gap-4">
        <button
          type="button"
          onClick={openSchedulerDocs}
          class="text-xs font-medium text-gray-9 transition-colors hover:text-gray-12"
        >
          {tr("session.scheduled.learn_more")}
        </button>
        <button
          type="button"
          onClick={() => props.refreshJobs({ force: true })}
          disabled={!supported() || props.busy}
          class={`flex items-center gap-1.5 text-xs font-medium transition-colors ${!supported() || props.busy
            ? "text-gray-8"
            : "text-gray-9 hover:text-gray-12"
            }`}
        >
          <RefreshCw size={14} />
          {props.busy ? tr("session.scheduled.refreshing") : tr("session.scheduled.refresh")}
        </button>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={props.newTaskDisabled}
          class={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${props.newTaskDisabled
            ? "bg-gray-3 text-gray-8"
            : "bg-gray-12 text-gray-1 hover:bg-gray-11"
            }`}
        >
          <Plus size={14} />
          {tr("session.scheduled.new_automation")}
        </button>
      </div>

      <div class="pt-8 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-4 bg-gray-1 shadow-sm">
          <Terminal size={28} class="text-gray-9" />
        </div>
        <div class="flex items-center justify-center gap-2">
          <h2 class="text-2xl font-semibold text-gray-12">{tr("session.scheduled.title")}</h2>
          <span class="rounded border border-gray-4 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight text-gray-8">
            {tr("session.scheduled.beta")}
          </span>
        </div>
        <p class="mt-2 text-sm text-gray-9">{sourceDescription()}</p>
      </div>

      <Show when={supportNote()}>
        <div class="rounded-xl border border-gray-4 bg-gray-2/60 px-5 py-4 text-sm text-gray-10">
          {supportNote()}
        </div>
      </Show>

      <Show when={props.status}>
        <div class="rounded-xl border border-red-7/40 bg-red-3/60 px-5 py-4 text-sm text-red-11">
          {props.status}
        </div>
      </Show>

      <Show when={deleteError()}>
        <div class="rounded-xl border border-red-7/40 bg-red-3/60 px-5 py-4 text-sm text-red-11">
          {deleteError()}
        </div>
      </Show>

      <Show
        when={props.jobs.length > 0}
        fallback={
          <div class="space-y-4">
            <div class="text-center text-sm text-gray-9">
              {tr("session.scheduled.empty_state")}
            </div>
            <div class="grid w-full max-w-5xl mx-auto grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <For each={automationTemplates}>
                {(card) => (
                  <AutomationCard
                    icon={card.icon}
                    description={tr(card.descriptionKey)}
                    tone={card.tone}
                    onClick={() => launchAutomationPrompt(tr(card.promptKey))}
                    disabled={props.newTaskDisabled}
                  />
                )}
              </For>
            </div>
            <button
              type="button"
              onClick={openSchedulerDocs}
              class="mx-auto block text-xs text-gray-9 transition-colors hover:text-gray-12"
            >
              {tr("session.scheduled.explore_more")}
            </button>
          </div>
        }
      >
        <div class="grid w-full grid-cols-1 gap-4">
          <For each={props.jobs}>
            {(job) => (
              <AutomationJobCard
                job={job}
                supported={supported()}
                busy={props.busy || deleteBusy()}
                onDelete={() => setDeleteTarget(job)}
                onRun={() => runAutomationNow(job)}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={deleteTarget()}>
        <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="bg-gray-1 border border-gray-6 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden focus:outline-none">
            <div class="p-6 space-y-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-12">{tr("session.scheduled.delete_title")}</h3>
                  <p class="text-xs text-gray-9 mt-1">{deleteDescription()}</p>
                </div>
              </div>
              <div class="rounded-xl bg-gray-2 border border-gray-6 p-3 text-xs text-gray-9 font-mono break-all">
                {deleteTarget()?.name}
              </div>
              <div class="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy()}>
                  {tr("session.scheduled.cancel")}
                </Button>
                <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy()}>
                  {deleteBusy() ? tr("session.scheduled.deleting") : tr("session.scheduled.delete_confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={createModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div class="w-full max-w-2xl rounded-3xl bg-gray-1 shadow-2xl overflow-hidden border border-gray-6 focus:outline-none">
            <div class="p-8 space-y-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold text-gray-12">{tr("session.scheduled.create_title")}</h2>
                  <p class="text-xs text-gray-9 mt-2">
                    {tr("session.scheduled.create_subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  class="rounded-full p-1 text-gray-8 transition-colors hover:bg-gray-2 hover:text-gray-12"
                >
                  <X size={18} />
                </button>
              </div>

              <div class="space-y-6">
                <div>
                  <label class="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-8">
                    {tr("session.scheduled.name")}
                  </label>
                  <input
                    type="text"
                    value={automationName()}
                    onInput={(event) => setAutomationName(event.currentTarget.value)}
                    class="w-full rounded-xl border border-gray-6 bg-gray-2/50 px-3 py-2 text-sm text-gray-12 focus:outline-none focus:ring-1 focus:ring-blue-9/20 focus:border-blue-8 transition-colors"
                  />
                </div>
                <div>
                  <label class="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-8">
                    {tr("session.scheduled.projects")}
                  </label>
                  <input
                    type="text"
                    value={automationProject()}
                    onInput={(event) => setAutomationProject(event.currentTarget.value)}
                    placeholder={tr("session.scheduled.choose_folder")}
                    class="w-full rounded-xl border border-gray-6 bg-gray-2/50 px-3 py-2 text-sm text-gray-12 focus:outline-none focus:ring-1 focus:ring-blue-9/20 focus:border-blue-8 transition-colors"
                  />
                </div>
                <div>
                  <label class="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-8">
                    {tr("session.scheduled.label_prompt")}
                  </label>
                  <div class="rounded-xl border border-gray-6 bg-gray-2/50 p-3 transition-colors focus-within:border-blue-8 focus-within:ring-1 focus-within:ring-blue-9/20">
                    <textarea
                      rows={4}
                      value={automationPrompt()}
                      onInput={(event) => setAutomationPrompt(event.currentTarget.value)}
                      class="w-full resize-none bg-transparent text-sm text-gray-12 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <label class="block text-[11px] font-bold uppercase tracking-wider text-gray-8">
                      {tr("session.scheduled.schedule")}
                    </label>
                    <div class="flex rounded-lg bg-gray-3 p-0.5">
                      <button
                        type="button"
                        onClick={() => setScheduleMode("daily")}
                        class={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${scheduleMode() === "daily"
                            ? "bg-gray-12 text-gray-1 shadow-sm"
                            : "text-gray-9 hover:text-gray-12"
                          }`}
                      >
                        {tr("session.scheduled.daily")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleMode("interval")}
                        class={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${scheduleMode() === "interval"
                            ? "bg-gray-12 text-gray-1 shadow-sm"
                            : "text-gray-9 hover:text-gray-12"
                          }`}
                      >
                        {tr("session.scheduled.interval")}
                      </button>
                    </div>
                  </div>
                  <Show
                    when={scheduleMode() === "daily"}
                    fallback={
                      <div class="flex flex-wrap items-center gap-3">
                        <div class="flex items-center gap-2 rounded-xl border border-gray-6 bg-gray-2/50 px-3 py-2 text-sm text-gray-12">
                          <span>{tr("session.scheduled.every")}</span>
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={intervalHours()}
                            onInput={(event) => updateIntervalHours(event.currentTarget.value)}
                            class="w-16 bg-transparent text-right focus:outline-none"
                            aria-label={`Every ${intervalHours()} hours`}
                          />
                          <span>{tr("session.scheduled.hours")}</span>
                        </div>
                      </div>
                    }
                  >
                    <div class="flex flex-wrap items-center gap-3">
                      <div class="flex items-center justify-between rounded-xl border border-gray-6 bg-gray-2/50 px-3 py-2 text-sm text-gray-12 transition-colors focus-within:border-blue-8 focus-within:ring-1 focus-within:ring-blue-9/20">
                        <input
                          type="time"
                          value={scheduleTime()}
                          onInput={(event) => setScheduleTime(event.currentTarget.value)}
                          class="bg-transparent focus:outline-none"
                        />
                        <Clock size={16} class="text-gray-8" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <For each={dayOptions}>
                          {(day) => (
                            <button
                              type="button"
                              onClick={() => toggleDay(day.id)}
                              class={`h-8 w-8 rounded-full text-[10px] font-bold transition-colors ${scheduleDays().includes(day.id)
                                ? "bg-gray-12 text-gray-1"
                                : "bg-gray-3 text-gray-9"
                                }`}
                            >
                              {getDayLabel(day.id, day.label)}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                  <Show when={cronExpression()}>
                    <div class="mt-2 text-[11px] text-gray-8">
                      Cron: <span class="font-mono text-gray-12">{cronExpression()}</span>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-4 border-t border-gray-6 bg-gray-2 px-8 py-5">
              <button
                type="button"
                onClick={openSchedulerDocs}
                class="text-xs font-medium text-gray-9 transition-colors hover:text-gray-12"
              >
                {tr("session.scheduled.view_docs")}
              </button>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  class="px-4 py-2 text-xs font-medium text-gray-8 transition-colors hover:text-gray-12"
                >
                  {tr("session.scheduled.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateAutomation}
                  disabled={!canCreateAutomation() || props.newTaskDisabled}
                  class={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${!canCreateAutomation() || props.newTaskDisabled
                    ? "bg-gray-3 text-gray-8 cursor-not-allowed"
                    : "bg-gray-12 text-gray-1 hover:bg-gray-11"
                    }`}
                >
                  {tr("session.scheduled.create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
