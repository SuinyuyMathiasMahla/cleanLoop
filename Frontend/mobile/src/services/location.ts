import * as Location from 'expo-location';

export interface LocationResult {
  latitude: number;
  longitude: number;
  address: string;
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<LocationResult> {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('Location permission denied. Please enable location access in Settings.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;
  const address = await reverseGeocode(latitude, longitude);

  return { latitude, longitude, address };
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const loc = results[0];
      const parts = [loc.streetNumber, loc.street, loc.city, loc.region].filter(Boolean);
      return parts.join(', ') || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
  } catch {
    // Fall through to coordinate string
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
