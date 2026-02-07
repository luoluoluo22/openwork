import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js";

import { formatBytes, formatRelativeTime, isTauriRuntime } from "../utils";

import Button from "../components/button";
import { HardDrive, MessageCircle, PlugZap, RefreshCcw, Shield, Smartphone, X } from "lucide-solid";
import type { OpencodeConnectStatus, ProviderListItem, SettingsTab, StartupPreference } from "../types";
import { createOpenworkServerClient } from "../lib/openwork-server";
import type {
  OpenworkAuditEntry,
  OpenworkServerCapabilities,
  OpenworkServerDiagnostics,
  OpenworkServerSettings,
  OpenworkServerStatus,
} from "../lib/openwork-server";
import type {
  EngineInfo,
  OpenwrkBinaryInfo,
  OpenwrkStatus,
  OpenworkServerInfo,
  OwpenbotInfo,
  OwpenbotStatus,
  OwpenbotPairingRequest,
} from "../lib/tauri";
import {
  getOwpenbotStatus,
  getOwpenbotStatusDetailed,
  getOwpenbotQr,
  setOwpenbotDmPolicy,
  setOwpenbotAllowlist,
  setOwpenbotTelegramToken,
  setOwpenbotSlackTokens,
  getOwpenbotPairingRequests,
  approveOwpenbotPairing,
  denyOwpenbotPairing,
  owpenbotRestart,
  owpenbotStop,
  getOwpenbotGroupsEnabled,
  setOwpenbotGroupsEnabled,
} from "../lib/tauri";
import { t, currentLocale } from "../../i18n";

export type SettingsViewProps = {
  startupPreference: StartupPreference | null;
  baseUrl: string;
  headerStatus: string;
  busy: boolean;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  providers: ProviderListItem[];
  providerConnectedIds: string[];
  providerAuthBusy: boolean;
  openProviderAuthModal: () => Promise<void>;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerHostInfo: OpenworkServerInfo | null;
  openworkServerCapabilities: OpenworkServerCapabilities | null;
  openworkServerDiagnostics: OpenworkServerDiagnostics | null;
  openworkServerWorkspaceId: string | null;
  openworkAuditEntries: OpenworkAuditEntry[];
  openworkAuditStatus: "idle" | "loading" | "error";
  openworkAuditError: string | null;
  opencodeConnectStatus: OpencodeConnectStatus | null;
  engineInfo: EngineInfo | null;
  openwrkStatus: OpenwrkStatus | null;
  owpenbotInfo: OwpenbotInfo | null;
  developerMode: boolean;
  toggleDeveloperMode: () => void;
  stopHost: () => void;
  engineSource: "path" | "sidecar";
  setEngineSource: (value: "path" | "sidecar") => void;
  engineRuntime: "direct" | "openwrk";
  setEngineRuntime: (value: "direct" | "openwrk") => void;
  isWindows: boolean;
  defaultModelLabel: string;
  defaultModelRef: string;
  openDefaultModelPicker: () => void;
  showThinking: boolean;
  toggleShowThinking: () => void;
  hideTitlebar: boolean;
  toggleHideTitlebar: () => void;
  modelVariantLabel: string;
  editModelVariant: () => void;
  themeMode: "light" | "dark" | "system";
  setThemeMode: (value: "light" | "dark" | "system") => void;
  updateAutoCheck: boolean;
  toggleUpdateAutoCheck: () => void;
  updateAutoDownload: boolean;
  toggleUpdateAutoDownload: () => void;
  updateStatus: {
    state: string;
    lastCheckedAt?: number | null;
    version?: string;
    date?: string;
    notes?: string;
    totalBytes?: number | null;
    downloadedBytes?: number;
    message?: string;
  } | null;
  updateEnv: { supported?: boolean; reason?: string | null } | null;
  appVersion: string | null;
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  installUpdateAndRestart: () => void;
  anyActiveRuns: boolean;
  onResetStartupPreference: () => void;
  openResetModal: (mode: "onboarding" | "all") => void;
  resetModalBusy: boolean;
  pendingPermissions: unknown;
  events: unknown;
  safeStringify: (value: unknown) => string;
  repairOpencodeCache: () => void;
  cacheRepairBusy: boolean;
  cacheRepairResult: string | null;
  notionStatus: "disconnected" | "connecting" | "connected" | "error";
  notionStatusDetail: string | null;
  notionError: string | null;
  notionBusy: boolean;
  connectNotion: () => void;
  engineDoctorVersion: string | null;
  language: "en" | "zh";
  setLanguage: (language: "en" | "zh") => void;
};

// Owpenbot Settings Component
export function OwpenbotSettings(props: {
  busy: boolean;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerSettings: OpenworkServerSettings;
  openworkServerWorkspaceId: string | null;
  openworkServerHostInfo: OpenworkServerInfo | null;
  developerMode: boolean;
}) {
  const tr = (key: string) => t(key, currentLocale());
  const [owpenbotStatus, setOwpenbotStatus] = createSignal<OwpenbotStatus | null>(null);
  const [qrCode, setQrCode] = createSignal<string | null>(null);
  const [qrLoading, setQrLoading] = createSignal(false);
  const [pairingRequests, setPairingRequests] = createSignal<OwpenbotPairingRequest[]>([]);
  const [telegramToken, setTelegramToken] = createSignal("");
  const [telegramTokenVisible, setTelegramTokenVisible] = createSignal(false);
  const [slackBotToken, setSlackBotToken] = createSignal("");
  const [slackAppToken, setSlackAppToken] = createSignal("");
  const [slackTokensVisible, setSlackTokensVisible] = createSignal(false);
  const [newAllowlistEntry, setNewAllowlistEntry] = createSignal("");
  const [savingPolicy, setSavingPolicy] = createSignal(false);
  const [savingAllowlist, setSavingAllowlist] = createSignal(false);
  const [savingTelegram, setSavingTelegram] = createSignal(false);
  const [savingSlack, setSavingSlack] = createSignal(false);
  const [groupsEnabled, setGroupsEnabled] = createSignal<boolean | null>(null);
  const [savingGroups, setSavingGroups] = createSignal(false);
  const [telegramCheckState, setTelegramCheckState] = createSignal<
    "idle" | "checking" | "success" | "warning" | "error"
  >("idle");
  const [telegramCheckMessage, setTelegramCheckMessage] = createSignal<string | null>(null);
  const [telegramCheckDetail, setTelegramCheckDetail] = createSignal<string | null>(null);
  const [slackCheckState, setSlackCheckState] = createSignal<
    "idle" | "checking" | "success" | "warning" | "error"
  >("idle");
  const [slackCheckMessage, setSlackCheckMessage] = createSignal<string | null>(null);
  const [slackCheckDetail, setSlackCheckDetail] = createSignal<string | null>(null);
  const openworkServerClient = createMemo(() => {
    const baseUrl = props.openworkServerUrl.trim();
    const localBaseUrl = props.openworkServerHostInfo?.baseUrl?.trim() ?? "";
    const hostToken = props.openworkServerHostInfo?.hostToken?.trim() ?? "";
    const clientToken = props.openworkServerHostInfo?.clientToken?.trim() ?? "";
    const settingsToken = props.openworkServerSettings.token?.trim() ?? "";
    // Use clientToken only when connecting to the local server; use settingsToken for remote
    const isLocalServer = localBaseUrl && baseUrl === localBaseUrl;
    const token = isLocalServer ? (clientToken || settingsToken) : (settingsToken || clientToken);
    if (!baseUrl || !token || !props.openworkServerWorkspaceId) return null;
    return createOpenworkServerClient({ baseUrl, token, hostToken: isLocalServer ? hostToken : undefined });
  });
  const debugOwpenbot = (message: string, data?: Record<string, unknown>) => {
    if (!props.developerMode) return;
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.debug(`[owpenbot] ${message}${payload}`);
  };

  // Load owpenbot status on mount
  onMount(async () => {
    await refreshStatus();
    await refreshPairingRequests();
    await refreshGroupsEnabled();
  });

  const refreshGroupsEnabled = async () => {
    const enabled = await getOwpenbotGroupsEnabled();
    setGroupsEnabled(enabled);
  };

  const handleGroupsToggle = async () => {
    if (savingGroups()) return;
    const current = groupsEnabled();
    const newValue = current === null ? true : !current;
    setSavingGroups(true);
    try {
      const result = await setOwpenbotGroupsEnabled(newValue);
      if (result.ok) {
        setGroupsEnabled(newValue);
      }
    } finally {
      setSavingGroups(false);
    }
  };

  const refreshStatus = async () => {
    const status = await getOwpenbotStatus();
    setOwpenbotStatus(status);
  };

  const refreshPairingRequests = async () => {
    const requests = await getOwpenbotPairingRequests();
    setPairingRequests(requests);
  };

  const setTelegramFeedback = (
    state: "checking" | "success" | "warning" | "error",
    message: string,
    detail?: string | null,
  ) => {
    setTelegramCheckState(state);
    setTelegramCheckMessage(message);
    setTelegramCheckDetail(detail ?? null);
  };

  const resetTelegramFeedback = () => {
    setTelegramCheckState("idle");
    setTelegramCheckMessage(null);
    setTelegramCheckDetail(null);
  };

  const setSlackFeedback = (
    state: "checking" | "success" | "warning" | "error",
    message: string,
    detail?: string | null,
  ) => {
    setSlackCheckState(state);
    setSlackCheckMessage(message);
    setSlackCheckDetail(detail ?? null);
  };

  const resetSlackFeedback = () => {
    setSlackCheckState("idle");
    setSlackCheckMessage(null);
    setSlackCheckDetail(null);
  };

  const normalizeTelegramError = (raw: string) =>
    raw.replace(/^Error:\s*/i, "").replace(/^Failed to [^:]+:\s*/i, "").trim();

  const formatTelegramError = (raw: string) => {
    const cleaned = normalizeTelegramError(raw);
    const lower = cleaned.toLowerCase();
    if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token is wrong")) {
      return {
        summary: tr("settings.telegram.error.unauthorized_summary"),
        detail: tr("settings.telegram.error.unauthorized_detail"),
      };
    }
    if (lower.includes("409") || lower.includes("conflict") || lower.includes("getupdates")) {
      return {
        summary: tr("settings.telegram.error.conflict_summary"),
        detail: tr("settings.telegram.error.conflict_detail"),
      };
    }
    const detail = cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
    return {
      summary: tr("settings.telegram.error.default_summary"),
      detail: detail || null,
    };
  };

  const normalizeSlackError = (raw: string) =>
    raw.replace(/^Error:\s*/i, "").replace(/^Failed to [^:]+:\s*/i, "").trim();

  const formatSlackError = (raw: string) => {
    const cleaned = normalizeSlackError(raw);
    const lower = cleaned.toLowerCase();
    if (lower.includes("invalid_auth") || lower.includes("not_authed") || lower.includes("token_revoked")) {
      return {
        summary: tr("settings.slack.error.auth_summary"),
        detail: tr("settings.slack.error.auth_detail"),
      };
    }
    if (lower.includes("missing_scope") || lower.includes("scope")) {
      return {
        summary: tr("settings.slack.error.scope_summary"),
        detail: tr("settings.slack.error.scope_detail"),
      };
    }
    const detail = cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
    return {
      summary: tr("settings.slack.error.default_summary"),
      detail: detail || null,
    };
  };

  const showQrCode = async () => {
    setQrLoading(true);
    try {
      const qr = await getOwpenbotQr();
      if (qr) {
        setQrCode(qr.qr);
      }
    } finally {
      setQrLoading(false);
    }
  };

  const hideQrCode = () => {
    setQrCode(null);
  };

  const handleDmPolicyChange = async (policy: OwpenbotStatus["whatsapp"]["dmPolicy"]) => {
    setSavingPolicy(true);
    try {
      await setOwpenbotDmPolicy(policy);
      await refreshStatus();
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleAddAllowlistEntry = async () => {
    const entry = newAllowlistEntry().trim();
    if (!entry) return;

    setSavingAllowlist(true);
    try {
      const current = owpenbotStatus()?.whatsapp.allowFrom || [];
      if (!current.includes(entry)) {
        await setOwpenbotAllowlist([...current, entry]);
        await refreshStatus();
      }
      setNewAllowlistEntry("");
    } finally {
      setSavingAllowlist(false);
    }
  };

  const handleRemoveAllowlistEntry = async (entry: string) => {
    setSavingAllowlist(true);
    try {
      const current = owpenbotStatus()?.whatsapp.allowFrom || [];
      await setOwpenbotAllowlist(current.filter((e) => e !== entry));
      await refreshStatus();
    } finally {
      setSavingAllowlist(false);
    }
  };

  const handleSaveTelegramToken = async () => {
    const token = telegramToken().trim();
    if (!token || savingTelegram()) return;

    setSavingTelegram(true);
    try {
      const latestStatus = await getOwpenbotStatus();
      if (latestStatus) {
        setOwpenbotStatus(latestStatus);
      }
      const serverClient = openworkServerClient();
      const workspaceId = props.openworkServerWorkspaceId;
      const useRemote = Boolean(serverClient && workspaceId);
      debugOwpenbot("save-token:start", {
        connection: props.openworkServerHostInfo ? "local" : "remote",
        tauri: isTauriRuntime(),
        useRemote,
        openworkServerStatus: props.openworkServerStatus,
        openworkServerUrl: props.openworkServerUrl,
        openworkServerWorkspaceId: props.openworkServerWorkspaceId,
        owpenbotHealthPort: latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
        hasToken: Boolean(
          (props.openworkServerHostInfo?.clientToken?.trim() || props.openworkServerSettings.token?.trim()) ?? false,
        ),
      });
      if (useRemote && serverClient && workspaceId) {
        if (props.openworkServerStatus === "disconnected") {
          setTelegramFeedback(
            "error",
            "OpenWork server is not connected.",
            "Add a server URL and token, then try again.",
          );
          debugOwpenbot("save-token:remote-missing-client", {
            openworkServerStatus: props.openworkServerStatus,
            openworkServerUrl: props.openworkServerUrl,
            openworkServerWorkspaceId: props.openworkServerWorkspaceId,
          });
          return;
        }

        setTelegramFeedback("checking", tr("settings.telegram.saving_host"));
        try {
          await serverClient.setOwpenbotTelegramToken(
            workspaceId,
            token,
            latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
          );
          debugOwpenbot("save-token:remote-success");
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setTelegramFeedback("error", tr("settings.telegram.failed_save"), detail || null);
          debugOwpenbot("save-token:remote-error", { detail });
          return;
        }

        setTelegramFeedback("success", tr("settings.telegram.saved"));
        setTelegramToken("");
        return;
      }

      setTelegramFeedback("checking", tr("settings.telegram.verify_local"));
      const result = await setOwpenbotTelegramToken(token);
      if (!result.ok) {
        const detail = normalizeTelegramError(result.stderr || "");
        setTelegramFeedback("error", tr("settings.telegram.failed_save"), detail || null);
        debugOwpenbot("save-token:local-error", { detail });
        return;
      }

      const statusResult = await getOwpenbotStatusDetailed();
      if (!statusResult.ok) {
        const parsed = formatTelegramError(statusResult.error || "Failed to verify Telegram.");
        setOwpenbotStatus(null);
        setTelegramFeedback("error", parsed.summary, parsed.detail);
        return;
      }

      const status = statusResult.status;
      setOwpenbotStatus(status);

      if (!status.telegram.configured) {
        setTelegramFeedback("error", tr("settings.telegram.saved_unconfigured_title"), tr("settings.telegram.saved_unconfigured_detail"));
        return;
      }
      if (!status.running) {
        setTelegramFeedback(
          "warning",
          tr("settings.telegram.saved_offline_title"),
          tr("settings.telegram.saved_offline_detail"),
        );
        return;
      }
      if (!status.telegram.enabled) {
        setTelegramFeedback(
          "warning",
          tr("settings.telegram.saved_disabled_title"),
          tr("settings.telegram.saved_disabled_detail"),
        );
        return;
      }

      setTelegramFeedback("success", tr("settings.telegram.connected"));
      setTelegramToken("");
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleSaveSlackTokens = async () => {
    const botToken = slackBotToken().trim();
    const appToken = slackAppToken().trim();
    if (!botToken || !appToken || savingSlack()) return;

    setSavingSlack(true);
    try {
      const latestStatus = await getOwpenbotStatus();
      if (latestStatus) {
        setOwpenbotStatus(latestStatus);
      }
      const serverClient = openworkServerClient();
      const workspaceId = props.openworkServerWorkspaceId;
      const useRemote = Boolean(serverClient && workspaceId);
      debugOwpenbot("save-slack:start", {
        connection: props.openworkServerHostInfo ? "local" : "remote",
        tauri: isTauriRuntime(),
        useRemote,
        openworkServerStatus: props.openworkServerStatus,
        openworkServerUrl: props.openworkServerUrl,
        openworkServerWorkspaceId: props.openworkServerWorkspaceId,
        owpenbotHealthPort: latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
      });

      if (useRemote && serverClient && workspaceId) {
        if (props.openworkServerStatus === "disconnected") {
          setSlackFeedback(
            "error",
            "OpenWork server is not connected.",
            "Add a server URL and token, then try again.",
          );
          debugOwpenbot("save-slack:remote-missing-client", {
            openworkServerStatus: props.openworkServerStatus,
            openworkServerUrl: props.openworkServerUrl,
            openworkServerWorkspaceId: props.openworkServerWorkspaceId,
          });
          return;
        }

        setSlackFeedback("checking", tr("settings.slack.saving_host"));
        try {
          await serverClient.setOwpenbotSlackTokens(
            workspaceId,
            botToken,
            appToken,
            latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
          );
          debugOwpenbot("save-slack:remote-success");
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setSlackFeedback("error", tr("settings.slack.failed_save"), detail || null);
          debugOwpenbot("save-slack:remote-error", { detail });
          return;
        }

        setSlackFeedback("success", tr("settings.slack.saved"));
        setSlackBotToken("");
        setSlackAppToken("");
        return;
      }

      setSlackFeedback("checking", tr("settings.slack.verify_local"));
      const result = await setOwpenbotSlackTokens(botToken, appToken);
      if (!result.ok) {
        const detail = normalizeSlackError(result.stderr || "");
        setSlackFeedback("error", tr("settings.slack.failed_save"), detail || null);
        debugOwpenbot("save-slack:local-error", { detail });
        return;
      }

      const statusResult = await getOwpenbotStatusDetailed();
      if (!statusResult.ok) {
        const parsed = formatSlackError(statusResult.error || "Failed to verify Slack.");
        setOwpenbotStatus(null);
        setSlackFeedback("error", parsed.summary, parsed.detail);
        return;
      }

      const status = statusResult.status;
      setOwpenbotStatus(status);

      if (!status.slack.configured) {
        setSlackFeedback(
          "error",
          tr("settings.slack.saved_unconfigured_title"),
          tr("settings.slack.saved_unconfigured_detail"),
        );
        return;
      }
      if (!status.running) {
        setSlackFeedback(
          "warning",
          tr("settings.slack.saved_offline_title"),
          tr("settings.slack.saved_offline_detail"),
        );
        return;
      }
      if (!status.slack.enabled) {
        setSlackFeedback(
          "warning",
          tr("settings.slack.saved_disabled_title"),
          tr("settings.slack.saved_disabled_detail"),
        );
        return;
      }

      setSlackFeedback("success", tr("settings.slack.connected"));
      setSlackBotToken("");
      setSlackAppToken("");
    } finally {
      setSavingSlack(false);
    }
  };

  const handleApprovePairing = async (code: string) => {
    await approveOwpenbotPairing(code);
    await refreshPairingRequests();
  };

  const handleDenyPairing = async (code: string) => {
    await denyOwpenbotPairing(code);
    await refreshPairingRequests();
  };

  const bridgeStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.running) {
      return "bg-green-7/10 text-green-11 border-green-7/20";
    }
    return "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const whatsappStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.whatsapp.linked) {
      return "text-green-11";
    }
    return "text-gray-9";
  });

  const telegramStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.telegram.configured) {
      return "text-green-11";
    }
    return "text-gray-9";
  });

  const slackStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.slack.configured) {
      return "text-green-11";
    }
    return "text-gray-9";
  });

  const telegramCheckStyle = createMemo(() => {
    switch (telegramCheckState()) {
      case "success":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "warning":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      case "error":
        return "bg-red-7/10 text-red-11 border-red-7/20";
      case "checking":
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const slackCheckStyle = createMemo(() => {
    switch (slackCheckState()) {
      case "success":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "warning":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      case "error":
        return "bg-red-7/10 text-red-11 border-red-7/20";
      case "checking":
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const dmPolicyOptions: { value: OwpenbotStatus["whatsapp"]["dmPolicy"]; label: string; description: string }[] = [
    { value: "pairing", label: "Pairing", description: "Requires approval for new contacts" },
    { value: "allowlist", label: "Allowlist", description: "Only specific numbers can message" },
    { value: "open", label: "Open", description: "Anyone can message (public)" },
    { value: "disabled", label: "Disabled", description: "DMs are disabled" },
  ];

  return (
    <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <MessageCircle size={16} class="text-gray-11" />
            <div class="text-sm font-medium text-gray-12">{tr("settings.messaging_bridge.title")}</div>
          </div>
          <div class="text-xs text-gray-10 mt-1">{tr("settings.messaging_bridge.description")}</div>
        </div>
        <div class={`text-xs px-2 py-1 rounded-full border ${bridgeStatusStyle()}`}>
          {owpenbotStatus()?.running ? tr("settings.messaging_bridge.running") : tr("settings.messaging_bridge.offline")}
        </div>
      </div>

      {/* Telegram Section */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-blue-7/20 flex items-center justify-center">
              <span class="text-xs">T</span>
            </div>
            <span class="text-sm font-medium text-gray-12">Telegram</span>
          </div>
          <span class={`text-xs ${telegramStatusStyle()}`}>
            {owpenbotStatus()?.telegram.configured ? tr("settings.telegram.configured") : tr("settings.telegram.not_configured")}
          </span>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-11">{tr("settings.telegram.bot_token")}</div>
          <div class="flex gap-2">
            <div class="flex-1 flex items-center gap-2">
              <input
                type={telegramTokenVisible() ? "text" : "password"}
                value={telegramToken()}
                onInput={(e) => {
                  setTelegramToken(e.currentTarget.value);
                  if (telegramCheckState() !== "idle") {
                    resetTelegramFeedback();
                  }
                }}
                placeholder={tr("settings.telegram.token_placeholder")}
                class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                disabled={props.busy || savingTelegram()}
              />
              <Button
                variant="outline"
                class="text-xs h-9 px-3 shrink-0"
                onClick={() => setTelegramTokenVisible((prev) => !prev)}
              >
                {telegramTokenVisible() ? tr("config.sharing.hide") : tr("config.sharing.show")}
              </Button>
            </div>
            <Button
              variant="secondary"
              class="text-xs h-9 px-3"
              onClick={handleSaveTelegramToken}
              disabled={props.busy || savingTelegram() || !telegramToken().trim()}
            >
              {savingTelegram() ? tr("settings.telegram.saving") : tr("settings.telegram.save")}
            </Button>
          </div>
          <Show when={telegramCheckState() !== "idle"}>
            <div class={`text-[11px] px-2 py-1 rounded-lg border ${telegramCheckStyle()}`}>
              {telegramCheckMessage()}
            </div>
            <Show when={telegramCheckDetail()}>
              <div class="text-[11px] text-gray-9">{telegramCheckDetail()}</div>
            </Show>
          </Show>
          <div class="text-[11px] text-gray-8" innerHTML={tr("settings.telegram.create_hint")}>
          </div>
        </div>

        <Show when={owpenbotStatus()?.telegram.configured}>
          <div class="flex items-center justify-between bg-gray-2/50 rounded-lg p-3">
            <div class="text-xs text-gray-11">
              {owpenbotStatus()?.telegram.enabled ? tr("settings.telegram.bot_enabled") : tr("settings.telegram.bot_disabled")}
            </div>
          </div>
        </Show>
      </div>

      {/* Slack Section */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-rose-7/20 flex items-center justify-center">
              <span class="text-xs">S</span>
            </div>
            <span class="text-sm font-medium text-gray-12">Slack</span>
          </div>
          <span class={`text-xs ${slackStatusStyle()}`}>
            {owpenbotStatus()?.slack.configured ? tr("settings.slack.configured") : tr("settings.slack.not_configured")}
          </span>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-11">{tr("settings.slack.bot_token")}</div>
          <div class="flex gap-2">
            <div class="flex-1 flex items-center gap-2">
              <input
                type={slackTokensVisible() ? "text" : "password"}
                value={slackBotToken()}
                onInput={(e) => {
                  setSlackBotToken(e.currentTarget.value);
                  if (slackCheckState() !== "idle") {
                    resetSlackFeedback();
                  }
                }}
                placeholder={tr("settings.slack.token_placeholder_bot")}
                class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                disabled={props.busy || savingSlack()}
              />
              <Button
                variant="outline"
                class="text-xs h-9 px-3 shrink-0"
                onClick={() => setSlackTokensVisible((prev) => !prev)}
              >
                {slackTokensVisible() ? tr("config.sharing.hide") : tr("config.sharing.show")}
              </Button>
            </div>
          </div>

          <div class="text-xs font-medium text-gray-11">{tr("settings.slack.app_token")}</div>
          <div class="flex gap-2">
            <input
              type={slackTokensVisible() ? "text" : "password"}
              value={slackAppToken()}
              onInput={(e) => {
                setSlackAppToken(e.currentTarget.value);
                if (slackCheckState() !== "idle") {
                  resetSlackFeedback();
                }
              }}
              placeholder={tr("settings.slack.token_placeholder_app")}
              class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
              disabled={props.busy || savingSlack()}
            />
            <Button
              variant="secondary"
              class="text-xs h-9 px-3"
              onClick={handleSaveSlackTokens}
              disabled={props.busy || savingSlack() || !slackBotToken().trim() || !slackAppToken().trim()}
            >
              {savingSlack() ? tr("settings.slack.saving") : tr("settings.slack.save")}
            </Button>
          </div>

          <Show when={slackCheckState() !== "idle"}>
            <div class={`text-[11px] px-2 py-1 rounded-lg border ${slackCheckStyle()}`}>
              {slackCheckMessage()}
            </div>
            <Show when={slackCheckDetail()}>
              <div class="text-[11px] text-gray-9">{slackCheckDetail()}</div>
            </Show>
          </Show>

          <div class="text-[11px] text-gray-8" innerHTML={tr("settings.slack.hint")}>
          </div>
        </div>

        <Show when={owpenbotStatus()?.slack.configured}>
          <div class="flex items-center justify-between bg-gray-2/50 rounded-lg p-3">
            <div class="text-xs text-gray-11">
              {owpenbotStatus()?.slack.enabled ? tr("settings.slack.bot_enabled") : tr("settings.slack.bot_disabled")}
            </div>
          </div>
        </Show>
      </div>

      {/* WhatsApp Section */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-green-7/20 flex items-center justify-center">
              <span class="text-xs">W</span>
            </div>
            <span class="text-sm font-medium text-gray-12">WhatsApp</span>
            <span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-7/10 text-amber-11 border border-amber-7/30">
              {tr("settings.whatsapp.alpha")}
            </span>
          </div>
          <span class={`text-xs ${whatsappStatusStyle()}`}>
            {owpenbotStatus()?.whatsapp.linked ? tr("settings.whatsapp.linked") : tr("settings.whatsapp.not_linked")}
          </span>
        </div>

        <div class="text-[11px] text-amber-11">
          {tr("settings.whatsapp.help_wanted")}
        </div>

        {/* QR Code Section */}
        <Show when={!owpenbotStatus()?.whatsapp.linked}>
          <div class="space-y-3">
            <Show
              when={qrCode()}
              fallback={
                <Button
                  variant="secondary"
                  class="w-full"
                  onClick={showQrCode}
                  disabled={props.busy || qrLoading()}
                >
                  {qrLoading() ? tr("settings.whatsapp.loading_qr") : tr("settings.whatsapp.show_qr")}
                </Button>
              }
            >
              <div class="relative">
                <div class="flex justify-center p-4 bg-dls-surface rounded-lg">
                  <img
                    src={`data:image/png;base64,${qrCode()}`}
                    alt="WhatsApp QR Code"
                    class="w-48 h-48"
                  />
                </div>
                <button
                  class="absolute top-2 right-2 p-1 rounded-full bg-gray-12/80 text-gray-1 hover:bg-gray-12"
                  onClick={hideQrCode}
                >
                  <X size={14} />
                </button>
                <div class="text-xs text-gray-10 text-center mt-2">
                  {tr("settings.whatsapp.scan_hint")}
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* DM Policy */}
        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-11">{tr("settings.whatsapp.dm_policy")}</div>
          <div class="grid grid-cols-2 gap-2">
            <For each={dmPolicyOptions}>
              {(option) => (
                <button
                  class={`px-3 py-2 rounded-lg text-left transition-colors ${owpenbotStatus()?.whatsapp.dmPolicy === option.value
                    ? "bg-gray-4 border border-gray-7"
                    : "bg-gray-2/60 border border-gray-6/50 hover:bg-gray-3"
                    }`}
                  onClick={() => handleDmPolicyChange(option.value)}
                  disabled={props.busy || savingPolicy()}
                >
                  <div class="text-xs font-medium text-gray-12">{option.label}</div>
                  <div class="text-[11px] text-gray-10">{option.description}</div>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Allowlist Editor */}
        <Show when={owpenbotStatus()?.whatsapp.dmPolicy === "allowlist"}>
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-11">{tr("settings.whatsapp.allowed_numbers")}</div>
            <div class="flex gap-2">
              <input
                type="text"
                value={newAllowlistEntry()}
                onInput={(e) => setNewAllowlistEntry(e.currentTarget.value)}
                placeholder="+1234567890"
                class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                disabled={props.busy || savingAllowlist()}
              />
              <Button
                variant="secondary"
                class="text-xs h-9 px-3"
                onClick={handleAddAllowlistEntry}
                disabled={props.busy || savingAllowlist() || !newAllowlistEntry().trim()}
              >
                {tr("settings.whatsapp.add")}
              </Button>
            </div>
            <Show when={(owpenbotStatus()?.whatsapp.allowFrom || []).length > 0}>
              <div class="flex flex-wrap gap-2 mt-2">
                <For each={owpenbotStatus()?.whatsapp.allowFrom || []}>
                  {(entry) => (
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-3 border border-gray-6 text-xs text-gray-12">
                      {entry}
                      <button
                        class="p-0.5 rounded hover:bg-gray-4"
                        onClick={() => handleRemoveAllowlistEntry(entry)}
                        disabled={props.busy || savingAllowlist()}
                      >
                        <X size={12} class="text-gray-10" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Groups Settings */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-gray-12">{tr("settings.groups.title")}</div>
            <div class="text-xs text-gray-10">{tr("settings.groups.description")}</div>
          </div>
          <Button
            variant={groupsEnabled() ? "secondary" : "outline"}
            class="text-xs h-8 py-0 px-3"
            onClick={handleGroupsToggle}
            disabled={props.busy || savingGroups() || groupsEnabled() === null}
          >
            {savingGroups() ? tr("settings.groups.saving") : groupsEnabled() ? tr("settings.groups.enabled") : tr("settings.groups.disabled")}
          </Button>
        </div>
      </div>

      {/* Pairing Requests */}
      <Show when={pairingRequests().length > 0}>
        <div class="bg-gray-1 rounded-xl border border-amber-7/30 p-4 space-y-3">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-amber-9 animate-pulse" />
            <span class="text-sm font-medium text-gray-12">{tr("settings.pairing.title")}</span>
          </div>
          <div class="divide-y divide-gray-6/50">
            <For each={pairingRequests()}>
              {(request) => (
                <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div class="min-w-0">
                    <div class="text-sm text-gray-12 truncate">{request.peerId}</div>
                    <div class="text-[11px] text-gray-9">
                      {request.platform === "whatsapp" ? "WhatsApp" : "Telegram"} · {formatRelativeTime(request.timestamp)}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      class="text-xs h-8 py-0 px-3"
                      onClick={() => handleApprovePairing(request.code)}
                      disabled={props.busy}
                    >
                      {tr("settings.pairing.approve")}
                    </Button>
                    <Button
                      variant="ghost"
                      class="text-xs h-8 py-0 px-3"
                      onClick={() => handleDenyPairing(request.code)}
                      disabled={props.busy}
                    >
                      {tr("settings.pairing.deny")}
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Info Note */}
      <div class="text-[11px] text-gray-8">
        {tr("settings.messaging_bridge.info")}
      </div>
    </div>
  );
}

export default function SettingsView(props: SettingsViewProps) {
  // Translation helper
  const tr = (key: string) => t(key, currentLocale());

  const updateState = () => props.updateStatus?.state ?? "idle";
  const updateNotes = () => props.updateStatus?.notes ?? null;
  const updateVersion = () => props.updateStatus?.version ?? null;
  const updateDate = () => props.updateStatus?.date ?? null;
  const updateLastCheckedAt = () => props.updateStatus?.lastCheckedAt ?? null;
  const updateDownloadedBytes = () => props.updateStatus?.downloadedBytes ?? null;
  const updateTotalBytes = () => props.updateStatus?.totalBytes ?? null;
  const updateErrorMessage = () => props.updateStatus?.message ?? null;

  const isMacToolbar = createMemo(() => {
    if (props.isWindows) return false;
    if (typeof navigator === "undefined") return false;
    const platform =
      typeof (navigator as any).userAgentData?.platform === "string"
        ? (navigator as any).userAgentData.platform
        : typeof navigator.platform === "string"
          ? navigator.platform
          : "";
    const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
    return /mac/i.test(platform) || /mac/i.test(ua);
  });

  const showUpdateToolbar = createMemo(() => {
    if (!isTauriRuntime()) return false;
    if (props.updateEnv && props.updateEnv.supported === false) return false;
    return isMacToolbar();
  });

  const updateToolbarTone = createMemo(() => {
    switch (updateState()) {
      case "available":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      case "ready":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "error":
        return "bg-red-7/10 text-red-11 border-red-7/20";
      case "checking":
      case "downloading":
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const updateToolbarSpinning = createMemo(() => updateState() === "checking" || updateState() === "downloading");

  const updateToolbarLabel = createMemo(() => {
    const state = updateState();
    const version = updateVersion();
    if (state === "available") {
      return `${tr("settings.update.available")}${version ? ` · v${version}` : ""}`;
    }
    if (state === "ready") {
      return `${tr("settings.update.ready")}${version ? ` · v${version}` : ""}`;
    }
    if (state === "downloading") {
      const downloaded = updateDownloadedBytes() ?? 0;
      const total = updateTotalBytes();
      const progress = total != null ? `${formatBytes(downloaded)} / ${formatBytes(total)}` : formatBytes(downloaded);
      return `${tr("settings.update.downloading")} ${progress}`;
    }
    if (state === "checking") {
      return tr("settings.update.checking");
    }
    if (state === "error") {
      return tr("settings.update.failed");
    }
    return tr("settings.update.up_to_date");
  });

  const updateToolbarActionLabel = createMemo(() => {
    const state = updateState();
    if (state === "available") return tr("settings.update.download");
    if (state === "ready") return tr("settings.update.install");
    if (state === "error") return tr("settings.update.retry");
    if (state === "idle") return tr("settings.update.check");
    return null;
  });

  const updateToolbarDisabled = createMemo(() => {
    const state = updateState();
    if (state === "checking" || state === "downloading") return true;
    if (state === "ready" && props.anyActiveRuns) return true;
    return props.busy;
  });

  const handleUpdateToolbarAction = () => {
    if (updateToolbarDisabled()) return;
    const state = updateState();
    if (state === "available") {
      props.downloadUpdate();
      return;
    }
    if (state === "ready") {
      props.installUpdateAndRestart();
      return;
    }
    props.checkForUpdates();
  };

  const notionStatusLabel = () => {
    switch (props.notionStatus) {
      case "connected":
        return tr("settings.notion.connected");
      case "connecting":
        return tr("settings.notion.reload_required");
      case "error":
        return tr("settings.notion.connection_failed");
      default:
        return tr("settings.notion.not_connected");
    }
  };

  const notionStatusStyle = () => {
    if (props.notionStatus === "connected") {
      return "bg-green-7/10 text-green-11 border-green-7/20";
    }
    if (props.notionStatus === "error") {
      return "bg-red-7/10 text-red-11 border-red-7/20";
    }
    if (props.notionStatus === "connecting") {
      return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    }
    return "bg-gray-4/60 text-gray-11 border-gray-7/50";
  };

  const [providerConnectError, setProviderConnectError] = createSignal<string | null>(null);
  const providerConnectedCount = createMemo(() => (props.providerConnectedIds ?? []).length);
  const providerAvailableCount = createMemo(() => (props.providers ?? []).length);
  const providerStatusLabel = createMemo(() => {
    if (!providerAvailableCount()) return tr("settings.providers.unavailable");
    if (!providerConnectedCount()) return tr("settings.providers.not_connected");
    return tr("settings.providers.connected_count").replace("{n}", String(providerConnectedCount()));
  });
  const providerStatusStyle = createMemo(() => {
    if (!providerAvailableCount()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (!providerConnectedCount()) return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });
  const providerSummary = createMemo(() => {
    if (!providerAvailableCount()) return tr("settings.providers.hint");
    const connected = providerConnectedCount();
    const available = providerAvailableCount();
    if (!connected) return tr("settings.providers.available_count").replace("{n}", String(available));
    return tr("settings.providers.summary").replace("{connected}", String(connected)).replace("{available}", String(available));
  });

  const handleOpenProviderAuth = async () => {
    if (props.busy || props.providerAuthBusy) return;
    setProviderConnectError(null);
    try {
      await props.openProviderAuthModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : tr("settings.providers.failed_open");
      setProviderConnectError(message);
    }
  };

  const openworkStatusLabel = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return tr("settings.status.connected");
      case "limited":
        return tr("settings.status.limited");
      default:
        return tr("settings.status.not_connected");
    }
  });

  const openworkStatusStyle = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "limited":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const engineStatusLabel = createMemo(() => {
    if (!isTauriRuntime()) return tr("settings.status.unavailable");
    return props.engineInfo?.running ? tr("settings.status.running") : tr("settings.status.offline");
  });

  const engineStatusStyle = createMemo(() => {
    if (!isTauriRuntime()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.engineInfo?.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const opencodeConnectStatusLabel = createMemo(() => {
    const status = props.opencodeConnectStatus?.status;
    if (!status) return tr("settings.status.idle");
    if (status === "connected") return tr("settings.status.connected");
    if (status === "connecting") return tr("settings.status.connecting");
    return tr("settings.status.failed");
  });

  const opencodeConnectStatusStyle = createMemo(() => {
    const status = props.opencodeConnectStatus?.status;
    if (!status) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (status === "connected") return "bg-green-7/10 text-green-11 border-green-7/20";
    if (status === "connecting") return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    return "bg-red-7/10 text-red-11 border-red-7/20";
  });

  const opencodeConnectTimestamp = createMemo(() => {
    const at = props.opencodeConnectStatus?.at;
    if (!at) return null;
    return formatRelativeTime(at);
  });

  const owpenbotStatusLabel = createMemo(() => {
    if (!isTauriRuntime()) return tr("settings.status.unavailable");
    return props.owpenbotInfo?.running ? tr("settings.status.running") : tr("settings.status.offline");
  });

  const owpenbotStatusStyle = createMemo(() => {
    if (!isTauriRuntime()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.owpenbotInfo?.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const [owpenbotRestarting, setOwpenbotRestarting] = createSignal(false);
  const [owpenbotRestartError, setOwpenbotRestartError] = createSignal<string | null>(null);

  const handleOwpenbotRestart = async () => {
    if (owpenbotRestarting()) return;
    const workspacePath = props.owpenbotInfo?.workspacePath?.trim() || props.engineInfo?.projectDir?.trim();
    const opencodeUrl = props.owpenbotInfo?.opencodeUrl?.trim() || props.engineInfo?.baseUrl?.trim();
    const opencodeUsername = props.engineInfo?.opencodeUsername?.trim() || undefined;
    const opencodePassword = props.engineInfo?.opencodePassword?.trim() || undefined;
    if (!workspacePath) {
      setOwpenbotRestartError("No workspace path available");
      return;
    }
    setOwpenbotRestarting(true);
    setOwpenbotRestartError(null);
    try {
      await owpenbotRestart({
        workspacePath,
        opencodeUrl: opencodeUrl || undefined,
        opencodeUsername,
        opencodePassword,
      });
    } catch (e) {
      setOwpenbotRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setOwpenbotRestarting(false);
    }
  };

  const handleOwpenbotStop = async () => {
    if (owpenbotRestarting()) return;
    setOwpenbotRestarting(true);
    setOwpenbotRestartError(null);
    try {
      await owpenbotStop();
    } catch (e) {
      setOwpenbotRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setOwpenbotRestarting(false);
    }
  };

  const openwrkStatusLabel = createMemo(() => {
    if (!props.openwrkStatus) return tr("settings.status.unavailable");
    return props.openwrkStatus.running ? tr("settings.status.running") : tr("settings.status.offline");
  });

  const openwrkStatusStyle = createMemo(() => {
    if (!props.openwrkStatus) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.openwrkStatus.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const openworkAuditStatusLabel = createMemo(() => {
    if (!props.openworkServerWorkspaceId) return tr("settings.status.unavailable");
    if (props.openworkAuditStatus === "loading") return tr("settings.status.loading");
    if (props.openworkAuditStatus === "error") return tr("settings.status.error");
    return tr("settings.status.ready");
  });

  const openworkAuditStatusStyle = createMemo(() => {
    if (!props.openworkServerWorkspaceId) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (props.openworkAuditStatus === "loading") return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    if (props.openworkAuditStatus === "error") return "bg-red-7/10 text-red-11 border-red-7/20";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });

  const isLocalEngineRunning = createMemo(() => Boolean(props.engineInfo?.running));
  const isLocalPreference = createMemo(() => props.startupPreference === "local");
  const startupLabel = createMemo(() => {
    if (props.startupPreference === "local") return tr("settings.startup.local");
    if (props.startupPreference === "server") return tr("settings.startup.server");
    return tr("settings.startup.not_set");
  });

  const tabLabel = (tab: SettingsTab) => {
    switch (tab) {
      case "model":
        return tr("settings.model");
      case "advanced":
        return tr("settings.advanced");
      case "debug":
        return tr("settings.developer");
      default:
        return tr("settings.general");
    }
  };

  const availableTabs = createMemo<SettingsTab[]>(() => {
    const tabs: SettingsTab[] = ["general", "model", "advanced"];
    if (props.developerMode) tabs.push("debug");
    return tabs;
  });

  const activeTab = createMemo<SettingsTab>(() => {
    const tabs = availableTabs();
    return tabs.includes(props.settingsTab) ? props.settingsTab : "general";
  });

  createEffect(() => {
    if (props.settingsTab !== activeTab()) {
      props.setSettingsTab(activeTab());
    }
  });

  const formatActor = (entry: OpenworkAuditEntry) => {
    const actor = entry.actor;
    if (!actor) return tr("settings.binary.unknown");
    if (actor.type === "host") return "host";
    if (actor.type === "remote") {
      return actor.clientId ? `remote:${actor.clientId}` : "remote";
    }
    return tr("settings.binary.unknown");
  };

  const formatCapability = (cap?: { read?: boolean; write?: boolean; source?: string }) => {
    if (!cap) return tr("settings.capability.unavailable");
    const parts = [cap.read ? tr("settings.capability.read") : null, cap.write ? tr("settings.capability.write") : null].filter(Boolean).join(" / ");
    const label = parts || tr("settings.capability.no_access");
    return cap.source ? `${label} · ${cap.source}` : label;
  };

  const engineStdout = () => {
    if (!isTauriRuntime()) return tr("settings.logs.desktop_only");
    return props.engineInfo?.lastStdout?.trim() || tr("settings.logs.no_stdout");
  };

  const engineStderr = () => {
    if (!isTauriRuntime()) return tr("settings.logs.desktop_only");
    return props.engineInfo?.lastStderr?.trim() || tr("settings.logs.no_stderr");
  };

  const openworkStdout = () => {
    if (!props.openworkServerHostInfo) return tr("settings.logs.host_only");
    return props.openworkServerHostInfo.lastStdout?.trim() || tr("settings.logs.no_stdout");
  };

  const openworkStderr = () => {
    if (!props.openworkServerHostInfo) return tr("settings.logs.host_only");
    return props.openworkServerHostInfo.lastStderr?.trim() || tr("settings.logs.no_stderr");
  };

  const owpenbotStdout = () => {
    if (!isTauriRuntime()) return tr("settings.logs.desktop_only");
    return props.owpenbotInfo?.lastStdout?.trim() || tr("settings.logs.no_stdout");
  };

  const owpenbotStderr = () => {
    if (!isTauriRuntime()) return tr("settings.logs.desktop_only");
    return props.owpenbotInfo?.lastStderr?.trim() || tr("settings.logs.no_stderr");
  };

  const formatOpenwrkBinary = (binary?: OpenwrkBinaryInfo | null) => {
    if (!binary) return tr("settings.binary.unavailable");
    const version = binary.actualVersion || binary.expectedVersion || tr("settings.binary.unknown");
    return `${binary.source} · ${version}`;
  };

  const formatOpenwrkBinaryVersion = (binary?: OpenwrkBinaryInfo | null) => {
    if (!binary) return "—";
    return binary.actualVersion || binary.expectedVersion || "—";
  };

  const openwrkBinaryPath = () => props.openwrkStatus?.binaries?.opencode?.path ?? "—";
  const openwrkSidecarSummary = () => {
    const info = props.openwrkStatus?.sidecar;
    if (!info) return tr("settings.sidecar.unavailable");
    const source = info.source ?? tr("settings.sidecar.auto");
    const target = info.target ?? tr("settings.binary.unknown");
    return `${source} · ${target}`;
  };

  const appVersionLabel = () => (props.appVersion ? `v${props.appVersion}` : "—");
  const opencodeVersionLabel = () => {
    const fromOpenwrk = formatOpenwrkBinaryVersion(props.openwrkStatus?.binaries?.opencode ?? null);
    if (fromOpenwrk !== "—") return fromOpenwrk;
    return props.engineDoctorVersion ?? "—";
  };
  const openworkServerVersionLabel = () => props.openworkServerDiagnostics?.version ?? "—";
  const owpenbotVersionLabel = () => props.owpenbotInfo?.version ?? "—";
  const openwrkVersionLabel = () => props.openwrkStatus?.cliVersion ?? "—";

  const formatUptime = (uptimeMs?: number | null) => {
    if (!uptimeMs) return "—";
    return formatRelativeTime(Date.now() - uptimeMs);
  };

  return (
    <section class="space-y-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-2xl border border-gray-6/40 bg-gray-1/40 px-3 py-2">
        <div class="flex flex-wrap gap-2">
          <For each={availableTabs()}>
            {(tab) => (
              <button
                class={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${activeTab() === tab
                  ? "bg-gray-12/10 text-gray-12 border-gray-6/30"
                  : "text-gray-10 border-gray-6/50 hover:text-gray-12 hover:bg-gray-2/40"
                  }`}
                onClick={() => props.setSettingsTab(tab)}
              >
                {tabLabel(tab)}
              </button>
            )}
          </For>
        </div>
        <Show when={showUpdateToolbar()}>
          <div class="flex flex-wrap items-center gap-2">
            <div
              class={`text-xs px-2 py-1 rounded-full border flex items-center gap-2 ${updateToolbarTone()}`}
              title={updateToolbarLabel()}
            >
              <Show when={updateToolbarSpinning()}>
                <RefreshCcw size={12} class="animate-spin" />
              </Show>
              <span>{updateToolbarLabel()}</span>
            </div>
            <Show when={updateToolbarActionLabel()}>
              <Button
                variant="outline"
                class="text-xs h-8 py-0 px-3"
                onClick={handleUpdateToolbarAction}
                disabled={updateToolbarDisabled()}
                title={updateState() === "ready" && props.anyActiveRuns ? "Stop active runs to update" : ""}
              >
                {updateToolbarActionLabel()}
              </Button>
            </Show>
          </div>
        </Show>
      </div>

      <Switch>
        <Match when={activeTab() === "general"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="text-sm font-medium text-gray-12">{tr("settings.connection_title")}</div>
              <div class="text-xs text-gray-10">{props.headerStatus}</div>
              <div class="text-xs text-gray-7 font-mono">{props.baseUrl}</div>
              <div class="pt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={props.toggleDeveloperMode}>
                  <Shield size={16} />
                  {props.developerMode ? tr("settings.disable_developer_mode") : tr("settings.enable_developer_mode")}
                </Button>
                <Show when={isLocalEngineRunning()}>
                  <Button variant="danger" onClick={props.stopHost} disabled={props.busy}>
                    {tr("settings.stop_engine")}
                  </Button>
                </Show>
                <Show when={!isLocalEngineRunning() && props.openworkServerStatus === "connected"}>
                  <Button variant="outline" onClick={props.stopHost} disabled={props.busy}>
                    {tr("settings.disconnect")}
                  </Button>
                </Show>
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="flex items-center gap-2">
                    <PlugZap size={16} class="text-gray-11" />
                    <div class="text-sm font-medium text-gray-12">{tr("providers.title")}</div>
                  </div>
                  <div class="text-xs text-gray-10 mt-1">{tr("providers.description")}</div>
                </div>
                <div class={`text-xs px-2 py-1 rounded-full border ${providerStatusStyle()}`}>
                  {providerStatusLabel()}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={handleOpenProviderAuth}
                  disabled={props.busy || props.providerAuthBusy}
                >
                  {props.providerAuthBusy ? tr("providers.loading") : tr("providers.connect")}
                </Button>
                <div class="text-xs text-gray-9">{providerSummary()}</div>
              </div>

              <Show when={providerConnectError()}>
                <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
                  {providerConnectError()}
                </div>
              </Show>

              <div class="text-[11px] text-gray-8">
                {tr("providers.api_keys_hint")}
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{tr("settings.appearance_title")}</div>
                <div class="text-xs text-gray-10">{tr("settings.appearance_hint")}</div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button
                  variant={props.themeMode === "system" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("system")}
                  disabled={props.busy}
                >
                  {tr("settings.theme_system")}
                </Button>
                <Button
                  variant={props.themeMode === "light" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("light")}
                  disabled={props.busy}
                >
                  {tr("settings.theme_light")}
                </Button>
                <Button
                  variant={props.themeMode === "dark" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("dark")}
                  disabled={props.busy}
                >
                  {tr("settings.theme_dark")}
                </Button>
              </div>

              <div class="text-xs text-gray-7">
                {tr("settings.theme_system_hint")}
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{tr("settings.language")}</div>
                <div class="text-xs text-gray-10">{tr("settings.language.description")}</div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button
                  variant={props.language === "en" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setLanguage("en")}
                  disabled={props.busy}
                >
                  English
                </Button>
                <Button
                  variant={props.language === "zh" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setLanguage("zh")}
                  disabled={props.busy}
                >
                  中文
                </Button>
              </div>

              <div class="text-xs text-gray-7">
                {tr("settings.language.description")}
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "model"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{tr("settings.model_title")}</div>
                <div class="text-xs text-gray-10">{tr("settings.model_hint")}</div>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12 truncate">{props.defaultModelLabel}</div>
                  <div class="text-xs text-gray-7 font-mono truncate">{props.defaultModelRef}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.openDefaultModelPicker}
                  disabled={props.busy}
                >
                  {tr("common.change")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{tr("settings.thinking_label")}</div>
                  <div class="text-xs text-gray-7">{tr("settings.thinking_hint")}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.toggleShowThinking}
                  disabled={props.busy}
                >
                  {props.showThinking ? tr("common.on") : tr("common.off")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{tr("settings.model_variant_label")}</div>
                  <div class="text-xs text-gray-7 font-mono truncate">{props.modelVariantLabel}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.editModelVariant}
                  disabled={props.busy}
                >
                  {tr("common.edit")}
                </Button>
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "advanced"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm font-medium text-gray-12">{tr("settings.updates_title")}</div>
                  <div class="text-xs text-gray-10">{tr("settings.updates_hint")}</div>
                </div>
                <div class="text-xs text-gray-7 font-mono">{props.appVersion ? `v${props.appVersion}` : ""}</div>
              </div>

              <Show
                when={!isTauriRuntime()}
                fallback={
                  <Show
                    when={props.updateEnv && props.updateEnv.supported === false}
                    fallback={
                      <>
                        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6">
                          <div class="space-y-0.5">
                            <div class="text-sm text-gray-12">{tr("settings.automatic_checks_label")}</div>
                            <div class="text-xs text-gray-7">{tr("settings.automatic_checks_hint")}</div>
                          </div>
                          <button
                            class={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${props.updateAutoCheck
                              ? "bg-gray-12/10 text-gray-12 border-gray-6/20"
                              : "text-gray-10 border-gray-6 hover:text-gray-12"
                              }`}
                            onClick={props.updateAutoCheck ? undefined : props.toggleUpdateAutoCheck}
                          >
                            {props.updateAutoCheck ? tr("common.on") : tr("common.off")}
                          </button>
                        </div>

                        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6">
                          <div class="space-y-0.5">
                            <div class="text-sm text-gray-12">{tr("settings.automatic_checks_label")} (Auto-download)</div>
                            <div class="text-xs text-gray-7">Download updates automatically (prompts to restart)</div>
                          </div>
                          <button
                            class={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${props.updateAutoDownload
                              ? "bg-gray-12/10 text-gray-12 border-gray-6/20"
                              : "text-gray-10 border-gray-6 hover:text-gray-12"
                              }`}
                            onClick={props.toggleUpdateAutoDownload}
                          >
                            {props.updateAutoDownload ? tr("common.on") : tr("common.off")}
                          </button>
                        </div>

                        <div class="flex items-center justify-between gap-3 bg-gray-1 p-3 rounded-xl border border-gray-6">
                          <div class="space-y-0.5">
                            <div class="text-sm text-gray-12">
                              <Switch>
                                <Match when={updateState() === "checking"}>{tr("settings.update_checking")}</Match>
                                <Match when={updateState() === "available"}>{tr("settings.update_available")}{updateVersion()}</Match>
                                <Match when={updateState() === "downloading"}>{tr("settings.update_downloading")}</Match>
                                <Match when={updateState() === "ready"}>{tr("settings.update_ready")}{updateVersion()}</Match>
                                <Match when={updateState() === "error"}>{tr("settings.update_error")}</Match>
                                <Match when={true}>{tr("settings.update_uptodate")}</Match>
                              </Switch>
                            </div>
                            <Show when={updateState() === "idle" && updateLastCheckedAt()}>
                              <div class="text-xs text-gray-7">
                                {tr("settings.last_checked")} {formatRelativeTime(updateLastCheckedAt() as number)}
                              </div>
                            </Show>
                            <Show when={updateState() === "available" && updateDate()}>
                              <div class="text-xs text-gray-7">{tr("settings.published")} {updateDate()}</div>
                            </Show>
                            <Show when={updateState() === "downloading"}>
                              <div class="text-xs text-gray-7">
                                {formatBytes((updateDownloadedBytes() as number) ?? 0)}
                                <Show when={updateTotalBytes() != null}>
                                  {` / ${formatBytes(updateTotalBytes() as number)}`}
                                </Show>
                              </div>
                            </Show>
                            <Show when={updateState() === "error"}>
                              <div class="text-xs text-red-11">{updateErrorMessage()}</div>
                            </Show>
                          </div>

                          <div class="flex items-center gap-2">
                            <Button
                              variant="outline"
                              class="text-xs h-8 py-0 px-3"
                              onClick={props.checkForUpdates}
                              disabled={props.busy || updateState() === "checking" || updateState() === "downloading"}
                            >
                              {tr("settings.check_update")}
                            </Button>

                            <Show when={updateState() === "available"}>
                              <Button
                                variant="secondary"
                                class="text-xs h-8 py-0 px-3"
                                onClick={props.downloadUpdate}
                                disabled={props.busy || updateState() === "downloading"}
                              >
                                {tr("settings.download_update")}
                              </Button>
                            </Show>

                            <Show when={updateState() === "ready"}>
                              <Button
                                variant="secondary"
                                class="text-xs h-8 py-0 px-3"
                                onClick={props.installUpdateAndRestart}
                                disabled={props.busy || props.anyActiveRuns}
                                title={props.anyActiveRuns ? tr("settings.stop_runs_to_update") : ""}
                              >
                                {tr("settings.install_restart")}
                              </Button>
                            </Show>
                          </div>
                        </div>

                        <Show when={updateState() === "available" && updateNotes()}>
                          <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-xs text-gray-11 whitespace-pre-wrap max-h-40 overflow-auto">
                            {updateNotes()}
                          </div>
                        </Show>
                      </>
                    }
                  >
                    <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-sm text-gray-11">
                      {props.updateEnv?.reason ?? tr("settings.updates_not_supported")}
                    </div>
                  </Show>
                }
              >
                <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-sm text-gray-11">
                  {tr("settings.updates_desktop_only")}
                </div>
              </Show>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="text-sm font-medium text-gray-12">{tr("settings.startup_title")}</div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6">
                <div class="flex items-center gap-3">
                  <div
                    class={`p-2 rounded-lg ${isLocalPreference() ? "bg-indigo-7/10 text-indigo-11" : "bg-green-7/10 text-green-11"
                      }`}
                  >
                    <Show when={isLocalPreference()} fallback={<Smartphone size={18} />}>
                      <HardDrive size={18} />
                    </Show>
                  </div>
                  <span class="text-sm font-medium text-gray-12">{startupLabel()}</span>
                </div>
                <Button variant="outline" class="text-xs h-8 py-0 px-3" onClick={props.stopHost} disabled={props.busy}>
                  {tr("settings.switch_mode")}
                </Button>
              </div>

              <Button variant="secondary" class="w-full justify-between group" onClick={props.onResetStartupPreference}>
                <span>{tr("settings.reset_startup_label")}</span>
                <RefreshCcw size={14} class="opacity-80 group-hover:rotate-180 transition-transform" />
              </Button>

              <p class="text-xs text-gray-7">
                {tr("settings.reset_startup_hint")}
              </p>
            </div>

            <Show when={isTauriRuntime()}>
              <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
                <div>
                  <div class="text-sm font-medium text-gray-12">{tr("settings.appearance_title")}</div>
                  <div class="text-xs text-gray-10">{tr("settings.appearance_hint")}</div>
                </div>

                <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                  <div class="min-w-0">
                    <div class="text-sm text-gray-12">Hide titlebar</div>
                    <div class="text-xs text-gray-7">
                      Hide the window titlebar. Useful for tiling window managers on Linux (Hyprland, i3, sway).
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    class="text-xs h-8 py-0 px-3 shrink-0"
                    onClick={props.toggleHideTitlebar}
                    disabled={props.busy}
                  >
                    {props.hideTitlebar ? tr("common.on") : tr("common.off")}
                  </Button>
                </div>
              </div>
            </Show>

            <Show when={isTauriRuntime() && isLocalPreference()}>
              <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                <div>
                  <div class="text-sm font-medium text-gray-12">{tr("settings.engine_source_label")}</div>
                  <div class="text-xs text-gray-10">{tr("settings.engine_source_hint")}</div>
                </div>

                <div class="space-y-3">
                  <div class="text-xs text-gray-10">{tr("settings.engine_source_label")}</div>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      variant={props.engineSource === "sidecar" ? "secondary" : "outline"}
                      onClick={() => props.setEngineSource("sidecar")}
                      disabled={props.busy}
                    >
                      {tr("settings.from_sidecar")}
                    </Button>
                    <Button
                      variant={props.engineSource === "path" ? "secondary" : "outline"}
                      onClick={() => props.setEngineSource("path")}
                      disabled={props.busy}
                    >
                      {tr("settings.from_path")}
                    </Button>
                  </div>
                  <div class="text-[11px] text-gray-7">
                    {tr("settings.engine_source_description")}
                  </div>
                </div>

                <Show when={props.developerMode}>
                  <div class="space-y-3">
                    <div class="text-xs text-gray-10">Engine runtime</div>
                    <div class="grid grid-cols-2 gap-2">
                      <Button
                        variant={props.engineRuntime === "direct" ? "secondary" : "outline"}
                        onClick={() => props.setEngineRuntime("direct")}
                        disabled={props.busy}
                      >
                        Direct (OpenCode)
                      </Button>
                      <Button
                        variant={props.engineRuntime === "openwrk" ? "secondary" : "outline"}
                        onClick={() => props.setEngineRuntime("openwrk")}
                        disabled={props.busy}
                      >
                        Openwrk orchestrator
                      </Button>
                    </div>
                    <div class="text-[11px] text-gray-7">{tr("settings.reload_description")}</div>
                  </div>
                </Show>
              </div>
            </Show>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{tr("settings.advanced_title")} & Recovery</div>
                <div class="text-xs text-gray-10">{tr("settings.advanced_hint")}</div>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{tr("settings.reset_onboarding_label")}</div>
                  <div class="text-xs text-gray-7">{tr("settings.reset_onboarding_hint")}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={() => props.openResetModal("onboarding")}
                  disabled={props.busy || props.resetModalBusy || props.anyActiveRuns}
                  title={props.anyActiveRuns ? tr("settings.stop_runs_to_reset") : ""}
                >
                  {tr("settings.reset")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{tr("settings.reset_app_data_label")}</div>
                  <div class="text-xs text-gray-7">{tr("settings.reset_app_data_hint")}</div>
                </div>
                <Button
                  variant="danger"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={() => props.openResetModal("all")}
                  disabled={props.busy || props.resetModalBusy || props.anyActiveRuns}
                  title={props.anyActiveRuns ? tr("settings.stop_runs_to_reset") : ""}
                >
                  {tr("settings.reset")}
                </Button>
              </div>

              <div class="text-xs text-gray-7">
                {tr("settings.reset_requires_hint")}
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "debug"}>
          <Show when={props.developerMode}>
            <section>
              <h3 class="text-sm font-medium text-gray-11 uppercase tracking-wider mb-4">Developer</h3>

              <div class="space-y-4">
                <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div class="min-w-0">
                    <div class="text-sm text-gray-12">OpenCode cache</div>
                    <div class="text-xs text-gray-7">
                      Repairs cached data used to start the engine. Safe to run.
                    </div>
                    <Show when={props.cacheRepairResult}>
                      <div class="text-xs text-gray-11 mt-2">{props.cacheRepairResult}</div>
                    </Show>
                  </div>
                  <Button
                    variant="secondary"
                    class="text-xs h-8 py-0 px-3 shrink-0"
                    onClick={props.repairOpencodeCache}
                    disabled={props.cacheRepairBusy || !isTauriRuntime()}
                    title={isTauriRuntime() ? "" : "Cache repair requires the desktop app"}
                  >
                    {props.cacheRepairBusy ? "Repairing cache" : "Repair cache"}
                  </Button>
                </div>

                <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                  <div>
                    <div class="text-sm font-medium text-gray-12">Devtools</div>
                    <div class="text-xs text-gray-10">Sidecar health, capabilities, and audit trail.</div>
                  </div>

                  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div>
                        <div class="text-sm font-medium text-gray-12">Versions</div>
                        <div class="text-xs text-gray-10">Sidecar + desktop build info.</div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">Desktop app: {appVersionLabel()}</div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">Openwrk: {openwrkVersionLabel()}</div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">OpenCode: {opencodeVersionLabel()}</div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          OpenWork server: {openworkServerVersionLabel()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">Owpenbot: {owpenbotVersionLabel()}</div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">OpenCode engine</div>
                          <div class="text-xs text-gray-10">Local execution sidecar.</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${engineStatusStyle()}`}>
                          {engineStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.engineInfo?.baseUrl ?? "Base URL unavailable"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.engineInfo?.projectDir ?? "No project directory"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">PID: {props.engineInfo?.pid ?? "—"}</div>
                      </div>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stdout</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {engineStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stderr</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {engineStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">Openwrk daemon</div>
                          <div class="text-xs text-gray-10">Workspace orchestration layer.</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${openwrkStatusStyle()}`}>
                          {openwrkStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.openwrkStatus?.dataDir ?? "Data directory unavailable"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          Daemon: {props.openwrkStatus?.daemon?.baseUrl ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          OpenCode: {props.openwrkStatus?.opencode?.baseUrl ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          Openwrk version: {props.openwrkStatus?.cliVersion ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          Sidecar: {openwrkSidecarSummary()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate" title={openwrkBinaryPath()}>
                          Opencode binary: {formatOpenwrkBinary(props.openwrkStatus?.binaries?.opencode ?? null)}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          Active workspace: {props.openwrkStatus?.activeId ?? "—"}
                        </div>
                      </div>
                      <Show when={props.openwrkStatus?.lastError}>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last error</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {props.openwrkStatus?.lastError}
                          </pre>
                        </div>
                      </Show>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">OpenCode SDK</div>
                          <div class="text-xs text-gray-10">UI connection diagnostics.</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${opencodeConnectStatusStyle()}`}>
                          {opencodeConnectStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.opencodeConnectStatus?.baseUrl ?? "Base URL unavailable"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.opencodeConnectStatus?.directory ?? "No project directory"}
                        </div>
                        <div class="text-[11px] text-gray-7">
                          Last attempt: {opencodeConnectTimestamp() ?? "—"}
                        </div>
                        <Show when={props.opencodeConnectStatus?.reason}>
                          <div class="text-[11px] text-gray-7">Reason: {props.opencodeConnectStatus?.reason}</div>
                        </Show>
                      </div>
                      <Show when={props.opencodeConnectStatus?.error}>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last error</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {props.opencodeConnectStatus?.error}
                          </pre>
                        </div>
                      </Show>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">OpenWork server</div>
                          <div class="text-xs text-gray-10">Config and approvals sidecar.</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${openworkStatusStyle()}`}>
                          {openworkStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {(props.openworkServerHostInfo?.baseUrl ?? props.openworkServerUrl) || "Base URL unavailable"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">PID: {props.openworkServerHostInfo?.pid ?? "—"}</div>
                      </div>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stdout</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {openworkStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stderr</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {openworkStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">Owpenbot sidecar</div>
                          <div class="text-xs text-gray-10">Messaging bridge service.</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${owpenbotStatusStyle()}`}>
                          {owpenbotStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.owpenbotInfo?.opencodeUrl?.trim() || "OpenCode URL unavailable"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.owpenbotInfo?.workspacePath?.trim() || "No workspace directory"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">PID: {props.owpenbotInfo?.pid ?? "—"}</div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={handleOwpenbotRestart}
                          disabled={owpenbotRestarting() || !isTauriRuntime()}
                          class="text-xs px-3 py-1.5"
                        >
                          <RefreshCcw class={`w-3.5 h-3.5 mr-1.5 ${owpenbotRestarting() ? "animate-spin" : ""}`} />
                          {owpenbotRestarting() ? "Restarting..." : "Restart"}
                        </Button>
                        <Show when={props.owpenbotInfo?.running}>
                          <Button
                            variant="ghost"
                            onClick={handleOwpenbotStop}
                            disabled={owpenbotRestarting()}
                            class="text-xs px-3 py-1.5"
                          >
                            Stop
                          </Button>
                        </Show>
                      </div>
                      <Show when={owpenbotRestartError()}>
                        <div class="text-xs text-red-11 bg-red-3/50 border border-red-6 rounded-lg p-2">
                          {owpenbotRestartError()}
                        </div>
                      </Show>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stdout</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {owpenbotStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">Last stderr</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {owpenbotStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">OpenWork server diagnostics</div>
                      <div class="text-[11px] text-gray-8 font-mono truncate">
                        {props.openworkServerDiagnostics?.version ?? "—"}
                      </div>
                    </div>
                    <Show
                      when={props.openworkServerDiagnostics}
                      fallback={<div class="text-xs text-gray-9">Diagnostics unavailable.</div>}
                    >
                      {(diag) => (
                        <div class="grid md:grid-cols-2 gap-2 text-xs text-gray-11">
                          <div>Started: {formatUptime(diag().uptimeMs)}</div>
                          <div>Read-only: {diag().readOnly ? "true" : "false"}</div>
                          <div>
                            Approval: {diag().approval.mode} ({diag().approval.timeoutMs}ms)
                          </div>
                          <div>Workspaces: {diag().workspaceCount}</div>
                          <div>Active workspace: {diag().activeWorkspaceId ?? "—"}</div>
                          <div>Config path: {diag().server.configPath ?? "default"}</div>
                          <div>Token source: {diag().tokenSource.client}</div>
                          <div>Host token source: {diag().tokenSource.host}</div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">OpenWork server capabilities</div>
                      <div class="text-[11px] text-gray-8 font-mono truncate">
                        {props.openworkServerWorkspaceId ? `Workspace ${props.openworkServerWorkspaceId}` : "Workspace unresolved"}
                      </div>
                    </div>
                    <Show
                      when={props.openworkServerCapabilities}
                      fallback={<div class="text-xs text-gray-9">Capabilities unavailable. Connect with a client token.</div>}
                    >
                      {(caps) => (
                        <div class="grid md:grid-cols-2 gap-2 text-xs text-gray-11">
                          <div>Skills: {formatCapability(caps().skills)}</div>
                          <div>Plugins: {formatCapability(caps().plugins)}</div>
                          <div>MCP: {formatCapability(caps().mcp)}</div>
                          <div>Config: {formatCapability(caps().config)}</div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class="grid md:grid-cols-2 gap-4">
                    <div class="bg-gray-1 border border-gray-6 rounded-xl p-4">
                      <div class="text-xs text-gray-10 mb-2">Pending permissions</div>
                      <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                        {props.safeStringify(props.pendingPermissions)}
                      </pre>
                    </div>
                    <div class="bg-gray-1 border border-gray-6 rounded-xl p-4">
                      <div class="text-xs text-gray-10 mb-2">Recent events</div>
                      <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                        {props.safeStringify(props.events)}
                      </pre>
                    </div>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">Audit log</div>
                      <div class={`text-xs px-2 py-1 rounded-full border ${openworkAuditStatusStyle()}`}>
                        {openworkAuditStatusLabel()}
                      </div>
                    </div>
                    <Show when={props.openworkAuditError}>
                      <div class="text-xs text-red-11">{props.openworkAuditError}</div>
                    </Show>
                    <Show
                      when={props.openworkAuditEntries.length > 0}
                      fallback={<div class="text-xs text-gray-9">No audit entries yet.</div>}
                    >
                      <div class="divide-y divide-gray-6/50">
                        <For each={props.openworkAuditEntries}>
                          {(entry) => (
                            <div class="flex items-start justify-between gap-4 py-2">
                              <div class="min-w-0">
                                <div class="text-sm text-gray-12 truncate">{entry.summary}</div>
                                <div class="text-[11px] text-gray-9 truncate">
                                  {entry.action} · {entry.target} · {formatActor(entry)}
                                </div>
                              </div>
                              <div class="text-[11px] text-gray-9 whitespace-nowrap">
                                {entry.timestamp ? formatRelativeTime(entry.timestamp) : "—"}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </section>
          </Show>
        </Match>
      </Switch>
    </section>
  );
}
