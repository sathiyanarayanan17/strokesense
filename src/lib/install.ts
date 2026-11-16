/** True for iPhone/iPad user agents, where there is no install prompt and users must use the Share menu. */
export function isIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
}
