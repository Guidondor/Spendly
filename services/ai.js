// Para emulador Android usá: http://10.0.2.2:8000
// Para dispositivo físico usá: http://<IP-de-tu-PC>:8000
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function categorizeTransaction(description, type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${BACKEND_URL}/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, type }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.category ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
