/** Instagram, Facebook, TikTok and similar apps open links in an embedded WebView where geolocation is often blocked. */
export function isLikelyInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = `${navigator.userAgent || ""}${navigator.vendor || ""}`;
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|MicroMessenger|TikTok/i.test(ua);
}
