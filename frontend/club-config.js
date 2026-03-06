(function () {
  const API_BASE = window.location.origin;
  const CLUB_CFG_CACHE_PREFIX = "greenlink.club_config.v1";
  const CLUB_CFG_CACHE_TTL_MS = 5 * 60 * 1000;

  const DEFAULT_CFG = Object.freeze({
    club_name: "GreenLink",
    club_slug: null,
    logo_url: "/frontend/assets/logo.png",
    currency_symbol: "R",
    labels: {
      member: "Member",
      visitor: "Affiliated Visitor",
      non_affiliated: "Visitor (No HNA)",
    },
    home_club_keywords: [],
    suggested_home_clubs: [],
  });

  let _clubPromise = null;
  
  function _cacheKey(requested, hasAuth) {
    const clubId = String(requested?.club_id || "").trim();
    const clubSlug = String(requested?.club_slug || "").trim().toLowerCase();
    const authPart = hasAuth ? "auth" : "anon";
    return `${CLUB_CFG_CACHE_PREFIX}:${authPart}:${clubId || "-"}:${clubSlug || "-"}`;
  }

  function _readCachedConfig(key) {
    try {
      if (!window.localStorage || !key) return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const expiresAt = Number(parsed.expires_at || 0);
      if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
        localStorage.removeItem(key);
        return null;
      }
      const data = parsed.data;
      if (!data || typeof data !== "object") return null;
      return data;
    } catch {
      return null;
    }
  }

  function _writeCachedConfig(key, cfg) {
    try {
      if (!window.localStorage || !key || !cfg) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          expires_at: Date.now() + CLUB_CFG_CACHE_TTL_MS,
          data: cfg,
        })
      );
    } catch {
      // Non-blocking cache write.
    }
  }

  function _requestedClubFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const rawClubId = params.get("club_id") || params.get("clubId");
      const rawSlug = params.get("club_slug") || params.get("clubSlug");
      const rawClub = params.get("club");

      const raw = (value) => (value == null ? null : String(value).trim());
      const clubId = raw(rawClubId) || (raw(rawClub) && /^\d+$/.test(raw(rawClub) || "") ? raw(rawClub) : null);
      const clubSlug = raw(rawSlug) || (raw(rawClub) && !/^\d+$/.test(raw(rawClub) || "") ? raw(rawClub) : null);

      return {
        club_id: clubId || null,
        club_slug: clubSlug || null,
      };
    } catch {
      return { club_id: null, club_slug: null };
    }
  }

  async function loadClubConfig() {
    if (_clubPromise) return _clubPromise;
    _clubPromise = (async () => {
      try {
        const token = window.localStorage ? localStorage.getItem("token") : null;
        const requested = _requestedClubFromUrl();
        const cacheKey = _cacheKey(requested, Boolean(token));
        const cached = _readCachedConfig(cacheKey);
        if (cached) return cached;

        const qp = new URLSearchParams();
        if (requested.club_id) qp.set("club_id", requested.club_id);
        else if (requested.club_slug) qp.set("club_slug", requested.club_slug);

        const baseUrl = token ? `${API_BASE}/api/public/club/me` : `${API_BASE}/api/public/club`;
        const url = (!token && qp.toString()) ? `${baseUrl}?${qp.toString()}` : baseUrl;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        let res = await fetch(url, { cache: "no-store", headers });
        if (!res.ok && token) {
          // Token may be stale while the page still needs branding.
          const publicUrl = qp.toString() ? `${API_BASE}/api/public/club?${qp.toString()}` : `${API_BASE}/api/public/club`;
          res = await fetch(publicUrl, { cache: "no-store" });
        }
        if (!res.ok) return DEFAULT_CFG;

        const data = await res.json();
        const merged = {
          ...DEFAULT_CFG,
          ...data,
          labels: { ...DEFAULT_CFG.labels, ...(data?.labels || {}) },
          home_club_keywords: Array.isArray(data?.home_club_keywords) ? data.home_club_keywords : DEFAULT_CFG.home_club_keywords,
          suggested_home_clubs: Array.isArray(data?.suggested_home_clubs) ? data.suggested_home_clubs : DEFAULT_CFG.suggested_home_clubs,
        };
        _writeCachedConfig(cacheKey, merged);
        return merged;
      } catch {
        return DEFAULT_CFG;
      }
    })();
    return _clubPromise;
  }

  function _norm(str) {
    return String(str || "").trim().toLowerCase();
  }

  function homeClubIsMember(homeClub, cfg) {
    const home = _norm(homeClub);
    if (!home) return false;
    const keywords = Array.isArray(cfg?.home_club_keywords) ? cfg.home_club_keywords : [];
    for (const k of keywords) {
      const kw = _norm(k);
      if (kw && home.includes(kw)) return true;
    }
    return false;
  }

  function applyClubBranding(cfg) {
    const clubName = String(cfg?.club_name || DEFAULT_CFG.club_name);
    const logoUrl = String(cfg?.logo_url || DEFAULT_CFG.logo_url);

    document.querySelectorAll(".club-name, .brand-kicker").forEach((el) => {
      el.textContent = clubName;
    });

    document.querySelectorAll("img[data-club-logo]").forEach((img) => {
      img.src = logoUrl;
      img.alt = `${clubName} logo`;
    });

    // Populate "home club" datalists if present.
    const list = document.getElementById("clubList");
    if (list) {
      const suggested = Array.isArray(cfg?.suggested_home_clubs) ? cfg.suggested_home_clubs : [];
      const values = [clubName, ...suggested].filter(Boolean);
      const uniq = Array.from(new Set(values.map((v) => String(v).trim()))).filter(Boolean);
      list.innerHTML = uniq.map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}"></option>`).join("");
    }
  }

  window.Greenlink = Object.assign(window.Greenlink || {}, {
    loadClubConfig,
    homeClubIsMember,
    applyClubBranding,
    invalidateClubConfigCache: function invalidateClubConfigCache() {
      try {
        if (!window.localStorage) return;
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`${CLUB_CFG_CACHE_PREFIX}:`)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
      } catch {
        // Ignore storage errors.
      }
      _clubPromise = null;
    },
    DEFAULT_CFG,
  });

  document.addEventListener("DOMContentLoaded", async () => {
    const cfg = await loadClubConfig();
    applyClubBranding(cfg);
  });
})();
