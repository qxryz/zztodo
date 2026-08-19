export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

export function detectDesktopPlatform(
  platformName: string,
  userAgent: string,
): DesktopPlatform {
  const platform = platformName.toLowerCase();
  const agent = userAgent.toLowerCase();

  if (platform.startsWith("win") || agent.includes("windows")) return "windows";
  if (
    platform === "darwin" ||
    platform.includes("mac") ||
    agent.includes("macintosh") ||
    agent.includes("mac os")
  ) {
    return "macos";
  }
  if (platform.includes("linux") || agent.includes("linux")) return "linux";
  return "unknown";
}

const runtimeNavigator = typeof navigator === "undefined" ? null : navigator;

export const desktopPlatform = runtimeNavigator
  ? detectDesktopPlatform(runtimeNavigator.platform, runtimeNavigator.userAgent)
  : "unknown";

export function getPlatformCopy(platform: DesktopPlatform) {
  return {
    tray: platform === "macos" ? "菜单栏" : "系统托盘",
    trayLocation:
      platform === "windows"
        ? "Windows 任务栏通知区域"
        : platform === "macos"
          ? "macOS 屏幕顶部菜单栏"
          : "桌面状态区",
    trayInteraction:
      platform === "windows"
        ? "左键打开主窗口，右键打开快捷菜单"
        : "左键打开快捷菜单",
    openFolder:
      platform === "macos"
        ? "用 Finder 打开"
        : platform === "windows"
          ? "用文件资源管理器打开"
          : "用文件管理器打开",
  } as const;
}

export const platformCopy = getPlatformCopy(desktopPlatform);

export function applyPlatformToDocument() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.platform = desktopPlatform;
  }
}
