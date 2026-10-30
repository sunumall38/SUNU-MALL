/** Position GPS actuelle de l'appareil (rejette si indisponible ou refusée). */
export function getCurrentPosition(timeout = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("GPS non disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout, enableHighAccuracy: true });
  });
}
