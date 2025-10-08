(function (global) {
  const STORAGE_KEY = "sav_token";

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (e) {
      console.warn("Impossible de lire le token dans le stockage local", e);
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn("Impossible d'écrire le token dans le stockage local", e);
    }
  }

  function clearToken() {
    setToken("");
  }

  function buildHeaders(headers) {
    if (headers instanceof Headers) {
      return headers;
    }
    const h = new Headers();
    if (headers && typeof headers === "object") {
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value !== "undefined") {
          h.append(key, value);
        }
      });
    }
    return h;
  }

  async function fetchJSON(url, options = {}) {
    const {
      method = "GET",
      headers,
      body,
      token = getToken(),
      parse = true,
      throwOnError = true
    } = options;

    const finalHeaders = buildHeaders(headers);
    let finalBody = body;

    if (
      finalBody &&
      typeof finalBody === "object" &&
      !(finalBody instanceof FormData) &&
      !finalHeaders.has("Content-Type")
    ) {
      finalHeaders.set("Content-Type", "application/json");
      finalBody = JSON.stringify(finalBody);
    }

    if (token && !finalHeaders.has("Authorization")) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: finalBody
    });

    const text = await response.text();
    let data = null;

    if (parse && text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    } else {
      data = text;
    }

    if (throwOnError && !response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  }

  async function supabaseFetch(path, options = {}) {
    const cfg = global.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error("Configuration Supabase manquante");
    }

    const {
      method = "GET",
      headers,
      body,
      token = getToken(),
      searchParams,
      throwOnError = true
    } = options;

    const url = new URL(path, cfg.url);
    if (searchParams && typeof searchParams === "object") {
      Object.entries(searchParams).forEach(([key, value]) => {
        if (typeof value !== "undefined" && value !== null) {
          url.searchParams.set(key, value);
        }
      });
    }

    const finalHeaders = buildHeaders(headers);
    finalHeaders.set("apikey", cfg.anonKey);
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }

    return fetchJSON(url.toString(), {
      method,
      headers: finalHeaders,
      body,
      token: null,
      throwOnError
    });
  }

  function ensureSessionId(sessionId) {
    if (!sessionId) {
      throw new Error("Session ID manquant");
    }
    return sessionId;
  }

  global.SAV = Object.freeze({
    STORAGE_KEY,
    getToken,
    setToken,
    clearToken,
    fetchJSON,
    supabaseFetch,
    ensureSessionId,
    buildHeaders
  });
})(window);
