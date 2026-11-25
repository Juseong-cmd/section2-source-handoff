export const appSlug = process.env.NEXT_PUBLIC_APP_SLUG || "section2";
export const appHasBay = appSlug === "section2";
export const appHasCommonEvents = appSlug === "section2" || appSlug === "process";
export const appTitle = process.env.NEXT_PUBLIC_APP_TITLE || (appSlug === "process" ? "공정관리 근태 관리" : "Section2 근태·잔업 관리");
export const appShortName = process.env.NEXT_PUBLIC_APP_SHORT_NAME || (appSlug === "process" ? "공정관리" : "Section2");
export const appDescription = process.env.NEXT_PUBLIC_APP_DESCRIPTION || "팀 근태와 잔업을 한 화면에서 관리하는 캘린더";
export const appIconPrefix = process.env.NEXT_PUBLIC_APP_ICON_PREFIX || (appSlug === "process" ? "process-icon" : "icon");
export const appAppleTouchIcon = appIconPrefix === "icon" ? "/apple-touch-icon.png" : `/${appIconPrefix}-apple-touch-icon.png`;
export const appStoragePrefix = process.env.NEXT_PUBLIC_APP_STORAGE_PREFIX || (appSlug === "process" ? "sms-process" : "sms-section2");
export const appHasOvertime = process.env.NEXT_PUBLIC_APP_HAS_OVERTIME
  ? process.env.NEXT_PUBLIC_APP_HAS_OVERTIME !== "false"
  : appSlug !== "process";
export const appReportingEnabled = process.env.NEXT_PUBLIC_TELEGRAM_REPORTING_ENABLED === "true";

export function getServerSiteConfig() {
  const slug = process.env.NEXT_PUBLIC_APP_SLUG || "section2";
  const stateKey = process.env.APP_STATE_KEY || (slug === "process" ? "process_main" : "main");
  const presenceKey = process.env.APP_PRESENCE_KEY || (slug === "process" ? "process_presence" : "presence");
  const backupPrefix = process.env.APP_BACKUP_PREFIX || (stateKey === "main" ? "backup_" : `${stateKey}_backup_`);

  return {
    slug,
    stateKey,
    presenceKey,
    backupPrefix,
  };
}
