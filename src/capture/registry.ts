import type { HookDefinition, PluginConfig } from "./types";

const configs = import.meta.glob(
  "../../abx-plugins/abx_plugins/plugins/*/config.json",
  { eager: true, import: "default" },
) as Record<string, PluginConfig>;
declare const __ABX_HOOK_PATHS__: string[];
export const plugins = Object.fromEntries(
  Object.entries(configs).map(([path, config]) => [
    path.split("/").at(-2)!,
    config,
  ]),
);
