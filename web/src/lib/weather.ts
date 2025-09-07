export interface Location {
  lat: number;
  lon: number;
  city?: string;
}

export interface Weather {
  tmax: number;
  tmin: number;
  desc: string;
}

export async function getLocation(): Promise<Location | null> {
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => resolve(null),
      { timeout: 10000 }
    );
  });
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.results?.[0]?.name;
}

export async function getDailyWeather(lat: number, lon: number, date: string): Promise<Weather | undefined> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  const data = await res.json();
  const code = data.daily.weathercode?.[0];
  const codeMap: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
  };
  return {
    tmax: data.daily.temperature_2m_max?.[0],
    tmin: data.daily.temperature_2m_min?.[0],
    desc: codeMap[code] || 'Unknown',
  };
}
