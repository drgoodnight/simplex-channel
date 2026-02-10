/**
 * Shared runtime state.
 *
 * Stores the OpenClaw plugin API reference so every module can access
 * the logger, runtime, and config without prop-drilling.
 */

let _api: any = null;

export function setApi(api: any): void {
  _api = api;
}

export function getApi(): any {
  if (!_api) throw new Error("[simplex] Plugin API not initialised");
  return _api;
}

export function getLogger(): any {
  return getApi().logger;
}

export function getRuntime(): any {
  return getApi().runtime;
}

export function getConfig(): any {
  return getApi().config;
}
