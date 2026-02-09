/**
 * Plugin runtime bridge.
 *
 * Stores the PluginAPI reference so other modules can access
 * the Gateway runtime, logger, and config without circular imports.
 */

let _api: any = null;

export function setApi(api: any): void {
  _api = api;
}

export function getApi(): any {
  if (!_api) throw new Error("SimpleX plugin API not initialized");
  return _api;
}

export function getLogger() {
  return getApi().logger;
}

export function getConfig() {
  return getApi().config;
}

export function getRuntime() {
  return getApi().runtime;
}
