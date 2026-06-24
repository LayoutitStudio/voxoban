function normalizeBase(value) {
  if (!value || value === "/") {
    return "/";
  }
  return value.endsWith("/") ? value : `${value}/`;
}

export function baseURL() {
  return normalizeBase(process.env.NUXT_APP_BASE_URL || "/");
}
