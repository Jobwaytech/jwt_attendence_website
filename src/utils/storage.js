export const getStorageData = (key, fallback = []) => {
  if (typeof window === "undefined") return fallback;

  const data = localStorage.getItem(key);

  try {
    return data ? JSON.parse(data) : fallback;
  } catch (error) {
    console.error(`Error reading ${key}`, error);
    return fallback;
  }
};

export const setStorageData = (key, value) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(key, JSON.stringify(value));
};