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

async function forwardGeocode(city: string): Promise<Location | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&language=en&count=1`;
  const res = await fetch(url);
  const data = await res.json();
  const r = data?.results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude, city: r.name } : null;
}

export async function getLocation(): Promise<Location | null> {
  if ('geolocation' in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
        });
      });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      /* fall through to manual input */
    }
  }

  const city = window.prompt('Enter your city');
  if (!city) return null;
  return await forwardGeocode(city);
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

export async function refreshWeather(
  entry: Record<string, unknown>,
  date: string
): Promise<{ location: Location; weather: Weather } | null> {
  const loc = await getLocation();
  if (!loc) return null;
  const city = loc.city ?? (await reverseGeocode(loc.lat, loc.lon));
  const weather = await getDailyWeather(loc.lat, loc.lon, date);
  if (!weather) return null;
  if (city) {
    entry.loc = { ...(entry.loc as Record<string, unknown>), city };
  }
  entry.loc = { ...(entry.loc as Record<string, unknown>), lat: loc.lat, lon: loc.lon };
  entry.weather = {
    tmax: weather.tmax,
    tmin: weather.tmin,
    desc: weather.desc,
  };
  return { location: { ...loc, city }, weather };
}
