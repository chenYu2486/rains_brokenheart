(() => {
    const cfg = window.AppConfig?.supabase;
    const MISSING = !cfg || !cfg.url || cfg.url === 'https://your-project-id.supabase.co' || !cfg.anonKey || cfg.anonKey === 'your-anon-key';

    const AUTH_HEADERS = {
        'apikey': cfg?.anonKey || '',
        'Content-Type': 'application/json',
    };

    async function api(path, opts = {}) {
        const res = await fetch(`${cfg.url}${path}`, {
            ...opts,
            headers: { ...AUTH_HEADERS, ...opts.headers },
        });
        if (!res.ok) {
            let msg = `请求失败 (${res.status})`;
            try {
                const err = await res.json();
                msg = err.error_description || err.msg || err.message || msg;
            } catch { /* ignore */ }
            const e = new Error(msg);
            e.status = res.status;
            throw e;
        }
        return res.json();
    }

    // ── 双存储：勾选 → localStorage / 不勾选 → sessionStorage ──

    const TOKEN_KEY = 'sb_access_token';
    const REFRESH_KEY = 'sb_refresh_token';

    let _persist = true; // 默认持久化

    function setPersist(persist) {
        _persist = persist;
        // 切换时把已存的搬过去
        const at = (persist ? sessionStorage : localStorage).getItem(TOKEN_KEY);
        const rt = (persist ? sessionStorage : localStorage).getItem(REFRESH_KEY);
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY);
        sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(REFRESH_KEY);
        const store = persist ? localStorage : sessionStorage;
        if (at) store.setItem(TOKEN_KEY, at);
        if (rt) store.setItem(REFRESH_KEY, rt);
    }

    function store() { return _persist ? localStorage : sessionStorage; }

    function saveTokens(accessToken, refreshToken) {
        const s = store();
        if (accessToken) s.setItem(TOKEN_KEY, accessToken);
        if (refreshToken) s.setItem(REFRESH_KEY, refreshToken);
    }

    function clearTokens() {
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY);
        sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(REFRESH_KEY);
    }

    function getStoredToken() {
        return store().getItem(TOKEN_KEY);
    }

    function getRefreshToken() {
        return store().getItem(REFRESH_KEY);
    }

    // ── 公开 API ──

    const AppAuth = {
        ready: !MISSING,
        error: MISSING ? '请在 config.js 中填写 supabase.url 和 supabase.anonKey' : null,

        setPersist,

        async signUp(email, password) {
            return await api('/auth/v1/signup', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
        },

        async signIn(email, password) {
            const data = await api('/auth/v1/token?grant_type=password', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            saveTokens(data.access_token, data.refresh_token);
            return data;
        },

        async signOut() {
            const token = getStoredToken();
            if (token) {
                try {
                    await api('/auth/v1/logout', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                    });
                } catch { /* ignore */ }
            }
            clearTokens();
        },

        async getSession() {
            const token = getStoredToken();
            if (!token) return null;
            try {
                const user = await api('/auth/v1/user', {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                return user;
            } catch {
                const refreshToken = getRefreshToken();
                if (!refreshToken) { clearTokens(); return null; }
                try {
                    const data = await api('/auth/v1/token?grant_type=refresh_token', {
                        method: 'POST',
                        body: JSON.stringify({ refresh_token: refreshToken }),
                    });
                    saveTokens(data.access_token, data.refresh_token);
                    return data.user;
                } catch {
                    clearTokens();
                    return null;
                }
            }
        },

        getUserEmail() {
            const token = getStoredToken();
            if (!token) return null;
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.email || null;
            } catch { return null; }
        }
    };

    window.AppAuth = AppAuth;
})();
