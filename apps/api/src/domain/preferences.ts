/** Personal operator preferences; workspace analytics settings belong to the tenant. */
export type UserPreferences = {
  theme: "light" | "dark" | "system" | null;
  defaultTenantId: string | null;
  landingPage: "overview" | "analytics";
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: null,
  defaultTenantId: null,
  landingPage: "overview",
};
