import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { t, currentLocale } from "../../i18n";

import { isTauriRuntime } from "../utils";

import Button from "../components/button";
import TextInput from "../components/text-input";
import { OwpenbotSettings } from "./settings";

import { RefreshCcw } from "lucide-solid";

import type { OpenworkServerSettings, OpenworkServerStatus } from "../lib/openwork-server";
import type { OpenworkServerInfo } from "../lib/tauri";

export type ConfigViewProps = {
  busy: boolean;
  clientConnected: boolean;
  anyActiveRuns: boolean;

  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerSettings: OpenworkServerSettings;
  openworkServerHostInfo: OpenworkServerInfo | null;
  openworkServerWorkspaceId: string | null;

  updateOpenworkServerSettings: (next: OpenworkServerSettings) => void;
  resetOpenworkServerSettings: () => void;
  testOpenworkServerConnection: (next: OpenworkServerSettings) => Promise<boolean>;

  canReloadWorkspace: boolean;
  reloadWorkspaceEngine: () => Promise<void>;
  reloadBusy: boolean;
  reloadError: string | null;

  workspaceAutoReloadAvailable: boolean;
  workspaceAutoReloadEnabled: boolean;
  setWorkspaceAutoReloadEnabled: (value: boolean) => void | Promise<void>;
  workspaceAutoReloadResumeEnabled: boolean;
  setWorkspaceAutoReloadResumeEnabled: (value: boolean) => void | Promise<void>;

  developerMode: boolean;
};

export default function ConfigView(props: ConfigViewProps) {
  const tr = (key: string) => t(key, currentLocale());
  const [openworkUrl, setOpenworkUrl] = createSignal("");
  const [openworkToken, setOpenworkToken] = createSignal("");
  const [openworkTokenVisible, setOpenworkTokenVisible] = createSignal(false);
  const [openworkTestState, setOpenworkTestState] = createSignal<"idle" | "testing" | "success" | "error">("idle");
  const [openworkTestMessage, setOpenworkTestMessage] = createSignal<string | null>(null);
  const [clientTokenVisible, setClientTokenVisible] = createSignal(false);
  const [hostTokenVisible, setHostTokenVisible] = createSignal(false);
  const [copyingField, setCopyingField] = createSignal<string | null>(null);
  let copyTimeout: number | undefined;

  createEffect(() => {
    setOpenworkUrl(props.openworkServerSettings.urlOverride ?? "");
    setOpenworkToken(props.openworkServerSettings.token ?? "");
  });

  createEffect(() => {
    openworkUrl();
    openworkToken();
    setOpenworkTestState("idle");
    setOpenworkTestMessage(null);
  });

  const openworkStatusLabel = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return tr("config.connect_status.connected");
      case "limited":
        return tr("config.connect_status.limited");
      default:
        return tr("config.connect_status.not_connected");
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

  const reloadAvailabilityReason = createMemo(() => {
    if (!props.clientConnected) return tr("config.reload.reason_not_connected");
    if (!props.canReloadWorkspace) {
      return tr("config.reload.reason_remote_only");
    }
    return null;
  });

  const reloadButtonLabel = createMemo(() => (props.reloadBusy ? tr("config.reload.reloading") : tr("config.reload.button")));
  const reloadButtonTone = createMemo(() => (props.anyActiveRuns ? "danger" : "secondary"));
  const reloadButtonDisabled = createMemo(() => props.reloadBusy || Boolean(reloadAvailabilityReason()));

  const buildOpenworkSettings = () => ({
    ...props.openworkServerSettings,
    urlOverride: openworkUrl().trim() || undefined,
    token: openworkToken().trim() || undefined,
  });

  const hasOpenworkChanges = createMemo(() => {
    const currentUrl = props.openworkServerSettings.urlOverride ?? "";
    const currentToken = props.openworkServerSettings.token ?? "";
    return openworkUrl().trim() !== currentUrl || openworkToken().trim() !== currentToken;
  });

  const hostInfo = createMemo(() => props.openworkServerHostInfo);
  const hostStatusLabel = createMemo(() => {
    if (!hostInfo()?.running) return tr("config.sharing.status_offline");
    return tr("config.sharing.status_available");
  });
  const hostStatusStyle = createMemo(() => {
    if (!hostInfo()?.running) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });
  const hostConnectUrl = createMemo(() => {
    const info = hostInfo();
    return info?.connectUrl ?? info?.mdnsUrl ?? info?.lanUrl ?? info?.baseUrl ?? "";
  });
  const hostConnectUrlUsesMdns = createMemo(() => hostConnectUrl().includes(".local"));

  const handleCopy = async (value: string, field: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyingField(field);
      if (copyTimeout !== undefined) {
        window.clearTimeout(copyTimeout);
      }
      copyTimeout = window.setTimeout(() => {
        setCopyingField(null);
        copyTimeout = undefined;
      }, 2000);
    } catch {
      // ignore
    }
  };

  onCleanup(() => {
    if (copyTimeout !== undefined) {
      window.clearTimeout(copyTimeout);
    }
  });

  return (
    <section class="space-y-6">
      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-2">
        <div class="text-sm font-medium text-gray-12">{tr("config.workspace.title")}</div>
        <div class="text-xs text-gray-10">
          {tr("config.workspace.description")}
        </div>
        <Show when={props.openworkServerWorkspaceId}>
          <div class="text-[11px] text-gray-7 font-mono truncate">
            {tr("config.workspace.id").replace("{id}", props.openworkServerWorkspaceId!)}
          </div>
        </Show>
      </div>

      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
        <div>
          <div class="text-sm font-medium text-gray-12">{tr("config.reload.title")}</div>
          <div class="text-xs text-gray-10">{tr("config.reload.description")}</div>
        </div>

        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
          <div class="min-w-0 space-y-1">
            <div class="text-sm text-gray-12">{tr("config.reload.action")}</div>
            <div class="text-xs text-gray-7">{tr("config.reload.action_description")}</div>
            <Show when={props.anyActiveRuns}>
              <div class="text-[11px] text-amber-11">{tr("config.reload.warning")}</div>
            </Show>
            <Show when={props.reloadError}>
              <div class="text-[11px] text-red-11">{props.reloadError}</div>
            </Show>
            <Show when={reloadAvailabilityReason()}>
              <div class="text-[11px] text-gray-9">{reloadAvailabilityReason()}</div>
            </Show>
          </div>
          <Button
            variant={reloadButtonTone()}
            class="text-xs h-8 py-0 px-3 shrink-0"
            onClick={props.reloadWorkspaceEngine}
            disabled={reloadButtonDisabled()}
          >
            <RefreshCcw size={14} class={props.reloadBusy ? "animate-spin" : ""} />
            {reloadButtonLabel()}
          </Button>
        </div>

        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
          <div class="min-w-0 space-y-1">
            <div class="text-sm text-gray-12">{tr("config.autoreload.title")}</div>
            <div class="text-xs text-gray-7">{tr("config.autoreload.description")}</div>
            <Show when={!props.workspaceAutoReloadAvailable}>
              <div class="text-[11px] text-gray-9">{tr("config.autoreload.hint")}</div>
            </Show>
          </div>
          <Button
            variant="outline"
            class="text-xs h-8 py-0 px-3 shrink-0"
            onClick={() => props.setWorkspaceAutoReloadEnabled(!props.workspaceAutoReloadEnabled)}
            disabled={props.busy || !props.workspaceAutoReloadAvailable}
          >
            {props.workspaceAutoReloadEnabled ? tr("config.autoreload.on") : tr("config.autoreload.off")}
          </Button>
        </div>

        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
          <div class="min-w-0 space-y-1">
            <div class="text-sm text-gray-12">{tr("config.resume.title")}</div>
            <div class="text-xs text-gray-7">
              {tr("config.resume.description")}
            </div>
          </div>
          <Button
            variant="outline"
            class="text-xs h-8 py-0 px-3 shrink-0"
            onClick={() => props.setWorkspaceAutoReloadResumeEnabled(!props.workspaceAutoReloadResumeEnabled)}
            disabled={
              props.busy ||
              !props.workspaceAutoReloadAvailable ||
              !props.workspaceAutoReloadEnabled
            }
            title={props.workspaceAutoReloadEnabled ? "" : tr("config.resume.hint")}
          >
            {props.workspaceAutoReloadResumeEnabled ? tr("config.autoreload.on") : tr("config.autoreload.off")}
          </Button>
        </div>
      </div>

      <Show when={hostInfo()}>
        <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="text-sm font-medium text-gray-12">{tr("config.sharing.title")}</div>
              <div class="text-xs text-gray-10">
                {tr("config.sharing.description")}
              </div>
            </div>
            <div class={`text-xs px-2 py-1 rounded-full border ${hostStatusStyle()}`}>
              {hostStatusLabel()}
            </div>
          </div>

          <div class="grid gap-3">
            <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
              <div class="min-w-0">
                <div class="text-xs font-medium text-gray-11">{tr("config.sharing.server_url")}</div>
                <div class="text-xs text-gray-7 font-mono truncate">{hostConnectUrl() || "Starting server…"}</div>
                <Show when={hostConnectUrl()}>
                  <div class="text-[11px] text-gray-8 mt-1">
                    {hostConnectUrlUsesMdns()
                      ? tr("config.sharing.mdns_hint")
                      : tr("config.sharing.ip_hint")}
                  </div>
                </Show>
              </div>
              <Button
                variant="outline"
                class="text-xs h-8 py-0 px-3 shrink-0"
                onClick={() => handleCopy(hostConnectUrl(), "host-url")}
                disabled={!hostConnectUrl()}
              >
                {copyingField() === "host-url" ? tr("config.sharing.copied") : tr("config.sharing.copy")}
              </Button>
            </div>

            <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
              <div class="min-w-0">
                <div class="text-xs font-medium text-gray-11">{tr("config.sharing.access_token")}</div>
                <div class="text-xs text-gray-7 font-mono truncate">
                  {clientTokenVisible()
                    ? hostInfo()?.clientToken || "—"
                    : hostInfo()?.clientToken
                      ? "••••••••••••"
                      : "—"}
                </div>
                <div class="text-[11px] text-gray-8 mt-1">{tr("config.sharing.access_token_hint")}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => setClientTokenVisible((prev) => !prev)}
                  disabled={!hostInfo()?.clientToken}
                >
                  {clientTokenVisible() ? tr("config.sharing.hide") : tr("config.sharing.show")}
                </Button>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => handleCopy(hostInfo()?.clientToken ?? "", "client-token")}
                  disabled={!hostInfo()?.clientToken}
                >
                  {copyingField() === "client-token" ? tr("config.sharing.copied") : tr("config.sharing.copy")}
                </Button>
              </div>
            </div>

            <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
              <div class="min-w-0">
                <div class="text-xs font-medium text-gray-11">{tr("config.sharing.server_token")}</div>
                <div class="text-xs text-gray-7 font-mono truncate">
                  {hostTokenVisible()
                    ? hostInfo()?.hostToken || "—"
                    : hostInfo()?.hostToken
                      ? "••••••••••••"
                      : "—"}
                </div>
                <div class="text-[11px] text-gray-8 mt-1">{tr("config.sharing.server_token_hint")}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => setHostTokenVisible((prev) => !prev)}
                  disabled={!hostInfo()?.hostToken}
                >
                  {hostTokenVisible() ? tr("config.sharing.hide") : tr("config.sharing.show")}
                </Button>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => handleCopy(hostInfo()?.hostToken ?? "", "host-token")}
                  disabled={!hostInfo()?.hostToken}
                >
                  {copyingField() === "host-token" ? tr("config.sharing.copied") : tr("config.sharing.copy")}
                </Button>
              </div>
            </div>
          </div>

          <div class="text-xs text-gray-9" innerHTML={tr("config.sharing.workspace_link_hint")}>
          </div>
        </div>
      </Show>

      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="text-sm font-medium text-gray-12">{tr("config.server.title")}</div>
            <div class="text-xs text-gray-10">
              {tr("config.server.description")}
            </div>
          </div>
          <div class={`text-xs px-2 py-1 rounded-full border ${openworkStatusStyle()}`}>{openworkStatusLabel()}</div>
        </div>

        <div class="grid gap-3">
          <TextInput
            label={tr("config.server.url_label")}
            value={openworkUrl()}
            onInput={(event) => setOpenworkUrl(event.currentTarget.value)}
            placeholder={tr("config.server.url_placeholder")}
            hint={tr("config.server.url_hint")}
            disabled={props.busy}
          />

          <label class="block">
            <div class="mb-1 text-xs font-medium text-gray-11">{tr("config.server.token_label")}</div>
            <div class="flex items-center gap-2">
              <input
                type={openworkTokenVisible() ? "text" : "password"}
                value={openworkToken()}
                onInput={(event) => setOpenworkToken(event.currentTarget.value)}
                placeholder={tr("config.server.token_placeholder")}
                disabled={props.busy}
                class="w-full rounded-xl bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
              />
              <Button
                variant="outline"
                class="text-xs h-9 px-3 shrink-0"
                onClick={() => setOpenworkTokenVisible((prev) => !prev)}
                disabled={props.busy}
              >
                {openworkTokenVisible() ? tr("config.sharing.hide") : tr("config.sharing.show")}
              </Button>
            </div>
            <div class="mt-1 text-xs text-gray-10">{tr("config.server.token_hint")}</div>
          </label>
        </div>

        <div class="text-[11px] text-gray-7 font-mono truncate">{tr("config.server.resolved").replace("{url}", openworkUrl().trim() || "Not set")}</div>

        <div class="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (openworkTestState() === "testing") return;
              const next = buildOpenworkSettings();
              props.updateOpenworkServerSettings(next);
              setOpenworkTestState("testing");
              setOpenworkTestMessage(null);
              try {
                const ok = await props.testOpenworkServerConnection(next);
                setOpenworkTestState(ok ? "success" : "error");
                setOpenworkTestMessage(
                  ok ? tr("config.server.status_success") : tr("config.server.status_failed"),
                );
              } catch (error) {
                const message = error instanceof Error ? error.message : tr("config.server.status_failed");
                setOpenworkTestState("error");
                setOpenworkTestMessage(message);
              }
            }}
            disabled={props.busy || openworkTestState() === "testing"}
          >
            {openworkTestState() === "testing" ? tr("config.server.testing") : tr("config.server.test")}
          </Button>
          <Button
            variant="outline"
            onClick={() => props.updateOpenworkServerSettings(buildOpenworkSettings())}
            disabled={props.busy || !hasOpenworkChanges()}
          >
            {tr("config.server.save")}
          </Button>
          <Button variant="ghost" onClick={props.resetOpenworkServerSettings} disabled={props.busy}>
            {tr("config.server.reset")}
          </Button>
        </div>

        <Show when={openworkTestState() !== "idle"}>
          <div
            class={`text-xs ${openworkTestState() === "success"
              ? "text-green-11"
              : openworkTestState() === "error"
                ? "text-red-11"
                : "text-gray-9"
              }`}
            role="status"
            aria-live="polite"
          >
            {openworkTestState() === "testing" ? tr("config.server.testing") : openworkTestMessage() ?? "Connection status updated."}
          </div>
        </Show>

        <Show when={openworkStatusLabel() !== "Connected"}>
          <div class="text-xs text-gray-9">{tr("config.server.connection_needed")}</div>
        </Show>
      </div>

      <OwpenbotSettings
        busy={props.busy}
        openworkServerStatus={props.openworkServerStatus}
        openworkServerUrl={props.openworkServerUrl}
        openworkServerSettings={props.openworkServerSettings}
        openworkServerWorkspaceId={props.openworkServerWorkspaceId}
        openworkServerHostInfo={props.openworkServerHostInfo}
        developerMode={props.developerMode}
      />

      <Show when={!isTauriRuntime()}>
        <div class="text-xs text-gray-9">
          {tr("config.desktop_only_hint")}
        </div>
      </Show>
    </section>
  );
}
