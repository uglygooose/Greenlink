(function () {
  const API_BASE = window.location.origin;

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
        const qp = new URLSearchParams();
        if (requested.club_id) qp.set("club_id", requested.club_id);
        else if (requested.club_slug) qp.set("club_slug", requested.club_slug);

        const baseUrl = token ? `${API_BASE}/api/public/club/me` : `${API_BASE}/api/public/club`;
        const url = (!token && qp.toString()) ? `${baseUrl}?${qp.toString()}` : baseUrl;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(url, { cache: "no-store", headers });
        if (!res.ok) return DEFAULT_CFG;
        const data = await res.json();
        return {
          ...DEFAULT_CFG,
          ...data,
          labels: { ...DEFAULT_CFG.labels, ...(data?.labels || {}) },
          home_club_keywords: Array.isArray(data?.home_club_keywords) ? data.home_club_keywords : DEFAULT_CFG.home_club_keywords,
          suggested_home_clubs: Array.isArray(data?.suggested_home_clubs) ? data.suggested_home_clubs : DEFAULT_CFG.suggested_home_clubs,
        };
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
    DEFAULT_CFG,
  });

  document.addEventListener("DOMContentLoaded", async () => {
    const cfg = await loadClubConfig();
    applyClubBranding(cfg);
  });
})();
