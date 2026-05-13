import "./styles.css";

const STORAGE_KEYS = {
  token: "authflow_token",
  session: "authflow_current_user",
  theme: "authflow_theme",
};

const API_BASE = import.meta.env.VITE_API_URL || "";

const state = {
  route: window.location.pathname,
  menuOpen: false,
  search: "",
  users: [],
  session: JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null"),
  loading: true,
  googleClientId: "",
  twoFactorToken: "",
  twoFactorMessage: "",
  twoFactorSetup: null,
};

const app = document.querySelector("#app");

function bootstrapStorage() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function navigate(path) {
  window.history.pushState({}, "", path);
  state.route = path;
  state.menuOpen = false;
  render();
}

function setSession(user, token) {
  state.session = user;
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(user));
  if (token) localStorage.setItem(STORAGE_KEYS.token, token);
}

function clearSession() {
  state.session = null;
  state.users = [];
  localStorage.removeItem(STORAGE_KEYS.session);
  localStorage.removeItem(STORAGE_KEYS.token);
}

function authHeaders() {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}

async function loadConfig() {
  const result = await apiRequest("/api/config");
  state.googleClientId = result.googleClientId || "";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

function icon(name, label = "") {
  return `<i data-lucide="${name}" aria-hidden="true"></i>${label ? `<span>${label}</span>` : ""}`;
}

function shell(content, options = {}) {
  const session = state.session;
  const theme = document.documentElement.dataset.theme || "light";
  const links = session?.role === "admin"
    ? [{ href: "/admin-dashboard", label: "Dashboard" }]
    : [
        { href: "/login", label: "Login" },
        { href: "/register", label: "Register" },
      ];

  return `
    <div class="app-shell">
      <header class="site-header">
        <button class="brand" data-route="/login" aria-label="Go to login">
          <span class="brand__mark">A</span>
          <span>
            <strong>AuthFlow</strong>
            <small>Google + 2FA Auth</small>
          </span>
        </button>

        <button class="nav-toggle" data-action="toggle-menu" aria-label="Toggle navigation" aria-expanded="${state.menuOpen}">
          ${icon("menu")}
        </button>

        <nav class="site-nav ${state.menuOpen ? "is-open" : ""}" aria-label="Main navigation">
          ${links
            .map(
              (link) => `
                <button class="nav-link ${state.route === link.href ? "is-active" : ""}" data-route="${link.href}">
                  ${link.label}
                </button>
              `,
            )
            .join("")}
          <button class="theme-toggle" data-action="toggle-theme" aria-label="Switch color theme">
            ${icon(theme === "dark" ? "sun" : "moon")}
            <span>${theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          ${
            session
              ? `<button class="button button--ghost" data-action="logout">${icon("log-out", "Logout")}</button>`
              : ""
          }
        </nav>
      </header>
      <main class="${options.dashboard ? "dashboard-main" : "auth-main"}">${content}</main>
    </div>
  `;
}

function loginView() {
  if (state.session?.role === "admin") {
    navigate("/admin-dashboard");
    return "";
  }

  return shell(`
    <section class="auth-layout">
      <aside class="visual-panel" aria-label="Project highlights">
        <div class="visual-panel__grid">
          <div class="metric-tile">
            ${icon("shield-check")}
            <strong>Role based</strong>
            <span>Admin access control</span>
          </div>
          <div class="metric-tile">
            ${icon("sparkles")}
            <strong>Modern UI</strong>
            <span>Responsive and polished</span>
          </div>
          <div class="metric-tile metric-tile--wide">
            ${icon("database")}
            <strong>LocalStorage powered</strong>
            <span>Demo auth with saved users, theme, and session</span>
          </div>
        </div>
      </aside>

      <section class="auth-card" aria-labelledby="login-title">
        <div class="eyebrow">${icon("lock-keyhole", "Secure demo portal")}</div>
        <h1 id="login-title">Welcome back</h1>
        <p class="lead">Sign in with your registered admin account to open the dashboard.</p>

        <form class="form" data-form="login" novalidate>
          <label>
            <span>Email address</span>
            <input type="email" name="email" placeholder="admin@example.com" autocomplete="email" />
            <small class="field-error" data-error-for="email"></small>
          </label>

          <label>
            <span>Password</span>
            <div class="password-field">
              <input type="password" name="password" placeholder="Enter password" autocomplete="current-password" />
              <button type="button" data-action="toggle-password" aria-label="Show password">${icon("eye")}</button>
            </div>
            <small class="field-error" data-error-for="password"></small>
          </label>

          <div class="form-error" data-form-error></div>
          <button class="button button--primary" type="submit">${icon("log-in", "Login")}</button>
        </form>

        <div class="divider"><span>or</span></div>
        ${
          state.googleClientId
            ? `<div id="googleSignIn" class="google-box"></div>`
            : `<div class="demo-note">${icon("triangle-alert")} Add <strong>GOOGLE_CLIENT_ID</strong> to enable real Gmail login.</div>`
        }

        ${
          state.twoFactorToken
            ? `
              <form class="form two-factor-panel" data-form="2fa-login" novalidate>
                <div class="eyebrow">${icon("shield-check", "Two factor required")}</div>
                <p>${state.twoFactorMessage || "Enter your authenticator app code to continue."}</p>
                <label>
                  <span>Authenticator code</span>
                  <input type="text" name="code" inputmode="numeric" placeholder="123456" autocomplete="one-time-code" />
                  <small class="field-error" data-error-for="code"></small>
                </label>
                <div class="form-error" data-form-error></div>
                <button class="button button--primary" type="submit">${icon("key-round", "Verify code")}</button>
              </form>
            `
            : ""
        }

        <p class="switch-copy">New here? <button data-route="/register">Create an account</button></p>
        <div class="demo-note">${icon("info")} Demo admin: <strong>admin@example.com</strong> / <strong>123456</strong></div>
      </section>
    </section>
  `);
}

function registerView() {
  return shell(`
    <section class="auth-layout auth-layout--reverse">
      <section class="auth-card" aria-labelledby="register-title">
        <div class="eyebrow">${icon("user-plus", "Create access")}</div>
        <h1 id="register-title">Register account</h1>
        <p class="lead">Create an admin or user profile. Admin accounts can enter the dashboard.</p>

        <form class="form" data-form="register" novalidate>
          <label>
            <span>Full name</span>
            <input type="text" name="name" placeholder="Your full name" autocomplete="name" />
            <small class="field-error" data-error-for="name"></small>
          </label>

          <label>
            <span>Email address</span>
            <input type="email" name="email" placeholder="you@example.com" autocomplete="email" />
            <small class="field-error" data-error-for="email"></small>
          </label>

          <div class="form-grid">
            <label>
              <span>Password</span>
              <div class="password-field">
                <input type="password" name="password" placeholder="Minimum 6 characters" autocomplete="new-password" />
                <button type="button" data-action="toggle-password" aria-label="Show password">${icon("eye")}</button>
              </div>
              <small class="field-error" data-error-for="password"></small>
            </label>

            <label>
              <span>Confirm password</span>
              <div class="password-field">
                <input type="password" name="confirmPassword" placeholder="Repeat password" autocomplete="new-password" />
                <button type="button" data-action="toggle-password" aria-label="Show password">${icon("eye")}</button>
              </div>
              <small class="field-error" data-error-for="confirmPassword"></small>
            </label>
          </div>

          <label>
            <span>Role</span>
            <select name="role">
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </label>

          <div class="form-error" data-form-error></div>
          <button class="button button--primary" type="submit">${icon("user-check", "Register")}</button>
        </form>

        <p class="switch-copy">Already registered? <button data-route="/login">Go to login</button></p>
      </section>

      <aside class="visual-panel visual-panel--register" aria-label="Authentication preview">
        <div class="phone-preview">
          <div class="phone-preview__top"></div>
          <div class="phone-preview__line"></div>
          <div class="phone-preview__line phone-preview__line--short"></div>
          <div class="phone-preview__cards">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="phone-preview__button"></div>
        </div>
      </aside>
    </section>
  `);
}

function dashboardView() {
  const session = state.session;
  if (!session || session.role !== "admin") {
    navigate("/login");
    showToast("Please login as an admin to continue.", "error");
    return "";
  }

  const users = state.users;
  const admins = users.filter((user) => user.role === "admin").length;
  const filteredUsers = users.filter((user) => {
    const value = `${user.name} ${user.email} ${user.role}`.toLowerCase();
    return value.includes(state.search.toLowerCase());
  });

  return shell(`
    <section class="dashboard">
      <div class="dashboard-hero">
        <div>
          <div class="eyebrow">${icon("layout-dashboard", "Admin dashboard")}</div>
          <h1>Hello, ${session.name}</h1>
          <p class="lead">Manage registered users, review roles, and control this demo authentication system.</p>
        </div>
        <div class="profile-card">
          <div class="avatar">${session.name.charAt(0).toUpperCase()}</div>
          <div>
            <strong>${session.name}</strong>
            <span>${session.email}</span>
          </div>
        </div>
      </div>

      <section class="stats-grid" aria-label="User statistics">
        <article class="stat-card">
          ${icon("users")}
          <span>Total users</span>
          <strong>${users.length}</strong>
        </article>
        <article class="stat-card">
          ${icon("shield")}
          <span>Admins</span>
          <strong>${admins}</strong>
        </article>
        <article class="stat-card">
          ${icon("user-round")}
          <span>Standard users</span>
          <strong>${users.length - admins}</strong>
        </article>
      </section>

      <section class="security-section">
        <div class="section-heading">
          <div>
            <h2>Two-factor authentication</h2>
            <p>${session.twoFactorEnabled ? "2FA is enabled for your admin account." : "Protect this admin account with an authenticator app."}</p>
          </div>
          <span class="role-pill role-pill--${session.twoFactorEnabled ? "admin" : "user"}">
            ${session.twoFactorEnabled ? "Enabled" : "Not enabled"}
          </span>
        </div>

        ${
          session.twoFactorEnabled
            ? `
              <form class="form inline-security-form" data-form="2fa-disable" novalidate>
                <label>
                  <span>Authenticator code</span>
                  <input type="text" name="code" inputmode="numeric" placeholder="123456" autocomplete="one-time-code" />
                  <small class="field-error" data-error-for="code"></small>
                </label>
                <div class="form-error" data-form-error></div>
                <button class="button button--ghost" type="submit">${icon("shield-off", "Disable 2FA")}</button>
              </form>
            `
            : `
              <button class="button button--primary setup-button" data-action="start-2fa">${icon("qr-code", "Set up 2FA")}</button>
              ${
                state.twoFactorSetup
                  ? `
                    <form class="form two-factor-setup" data-form="2fa-enable" novalidate>
                      <img src="${state.twoFactorSetup.qrCodeDataUrl}" alt="Authenticator QR code" />
                      <p>Scan this QR code in Google Authenticator, Microsoft Authenticator, or another TOTP app.</p>
                      <label>
                        <span>Authenticator code</span>
                        <input type="text" name="code" inputmode="numeric" placeholder="123456" autocomplete="one-time-code" />
                        <small class="field-error" data-error-for="code"></small>
                      </label>
                      <div class="form-error" data-form-error></div>
                      <button class="button button--primary" type="submit">${icon("shield-check", "Enable 2FA")}</button>
                    </form>
                  `
                  : ""
              }
            `
        }
      </section>

      <section class="table-section">
        <div class="section-heading">
          <div>
            <h2>Registered users</h2>
            <p>Search and remove accounts stored in the backend JSON database.</p>
          </div>
          <label class="search-box">
            ${icon("search")}
            <input type="search" data-action="search-users" value="${state.search}" placeholder="Search users" />
          </label>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredUsers.length
                  ? filteredUsers
                      .map(
                        (user) => `
                          <tr>
                            <td data-label="Name"><strong>${user.name}</strong></td>
                            <td data-label="Email">${user.email}</td>
                            <td data-label="Role"><span class="role-pill role-pill--${user.role}">${user.role}</span></td>
                            <td data-label="Created">${new Date(user.createdAt || Date.now()).toLocaleDateString()}</td>
                            <td data-label="Action">
                              <button class="icon-button" data-action="delete-user" data-user-id="${user.id}" aria-label="Delete ${user.name}" ${
                                user.email === session.email ? "disabled" : ""
                              }>
                                ${icon("trash-2")}
                              </button>
                            </td>
                          </tr>
                        `,
                      )
                      .join("")
                  : `<tr><td colspan="5" class="empty-state">No users match your search.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `, { dashboard: true });
}

function notFoundView() {
  return shell(`
    <section class="auth-card auth-card--center">
      <div class="eyebrow">${icon("compass", "404")}</div>
      <h1>Page not found</h1>
      <p class="lead">That route does not exist in this demo.</p>
      <button class="button button--primary" data-route="/login">${icon("arrow-left", "Back to login")}</button>
    </section>
  `);
}

function render() {
  if (state.loading) {
    app.innerHTML = `
      <main class="loading-screen">
        <div class="brand__mark">A</div>
        <p>Loading AuthFlow...</p>
      </main>
    `;
    return;
  }

  const routes = {
    "/": loginView,
    "/login": loginView,
    "/register": registerView,
    "/admin-dashboard": dashboardView,
  };

  app.innerHTML = (routes[state.route] || notFoundView)();
  window.lucide?.createIcons();
  initializeGoogleSignIn();
}

function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((error) => (error.textContent = ""));
  form.querySelector("[data-form-error]").textContent = "";
}

function setFieldError(form, field, message) {
  form.querySelector(`[data-error-for="${field}"]`).textContent = message;
}

async function handleLogin(form) {
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  let valid = true;

  if (!data.email.trim()) {
    setFieldError(form, "email", "Email is required.");
    valid = false;
  }
  if (!data.password.trim()) {
    setFieldError(form, "password", "Password is required.");
    valid = false;
  }
  if (!valid) return;

  try {
    const result = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim(),
        password: data.password,
      }),
    });

    await completePrimaryLogin(result);
  } catch (error) {
    form.querySelector("[data-form-error]").textContent = error.message;
  }
}

async function completePrimaryLogin(result) {
  if (result.requires2fa) {
    state.twoFactorToken = result.twoFactorToken;
    state.twoFactorMessage = result.message;
    render();
    showToast("Enter your 2FA code to continue.");
    return;
  }

  state.twoFactorToken = "";
  state.twoFactorMessage = "";
  setSession(result.user, result.token);
  await loadUsers();
  showToast(result.needs2faSetup ? "Login successful. Set up 2FA next." : "Login successful.");
  navigate("/admin-dashboard");
}

async function handleTwoFactorLogin(form) {
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));

  if (!data.code.trim()) {
    setFieldError(form, "code", "Authenticator code is required.");
    return;
  }

  try {
    const result = await apiRequest("/api/2fa/verify-login", {
      method: "POST",
      body: JSON.stringify({
        twoFactorToken: state.twoFactorToken,
        code: data.code,
      }),
    });
    await completePrimaryLogin(result);
  } catch (error) {
    form.querySelector("[data-form-error]").textContent = error.message;
  }
}

async function handleRegister(form) {
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  let valid = true;

  if (!data.name.trim()) {
    setFieldError(form, "name", "Full name is required.");
    valid = false;
  }
  if (!validateEmail(data.email.trim())) {
    setFieldError(form, "email", "Enter a valid email address.");
    valid = false;
  }
  if (data.password.length < 6) {
    setFieldError(form, "password", "Password must be at least 6 characters.");
    valid = false;
  }
  if (data.confirmPassword !== data.password) {
    setFieldError(form, "confirmPassword", "Passwords must match.");
    valid = false;
  }
  if (!valid) return;

  try {
    await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: data.name.trim(),
        email: data.email.trim(),
        password: data.password,
        role: data.role,
      }),
    });

    showToast("Registration complete. Please login.");
    navigate("/login");
  } catch (error) {
    form.querySelector("[data-form-error]").textContent = error.message;
  }
}

async function loadUsers() {
  if (state.session?.role !== "admin") return;
  const result = await apiRequest("/api/users");
  state.users = result.users;
}

async function startTwoFactorSetup() {
  try {
    state.twoFactorSetup = await apiRequest("/api/2fa/setup", { method: "POST" });
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleEnableTwoFactor(form) {
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  if (!data.code.trim()) {
    setFieldError(form, "code", "Authenticator code is required.");
    return;
  }

  try {
    const result = await apiRequest("/api/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code: data.code }),
    });
    setSession(result.user);
    state.twoFactorSetup = null;
    showToast("2FA enabled.");
    render();
  } catch (error) {
    form.querySelector("[data-form-error]").textContent = error.message;
  }
}

async function handleDisableTwoFactor(form) {
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  if (!data.code.trim()) {
    setFieldError(form, "code", "Authenticator code is required.");
    return;
  }

  try {
    const result = await apiRequest("/api/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code: data.code }),
    });
    setSession(result.user);
    showToast("2FA disabled.");
    render();
  } catch (error) {
    form.querySelector("[data-form-error]").textContent = error.message;
  }
}

function initializeGoogleSignIn() {
  if (!state.googleClientId || state.route !== "/login" || !window.google?.accounts?.id) return;
  const container = document.querySelector("#googleSignIn");
  if (!container) return;

  window.google.accounts.id.initialize({
    client_id: state.googleClientId,
    callback: async (response) => {
      try {
        const result = await apiRequest("/api/google-login", {
          method: "POST",
          body: JSON.stringify({ credential: response.credential }),
        });
        await completePrimaryLogin(result);
      } catch (error) {
        showToast(error.message, "error");
      }
    },
  });

  window.google.accounts.id.renderButton(container, {
    theme: document.documentElement.dataset.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    width: Math.min(container.clientWidth || 320, 360),
    text: "continue_with",
    shape: "rectangular",
  });
}

async function hydrateSession() {
  try {
    await loadConfig();
  } catch {
    state.googleClientId = "";
  }
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!token) {
    clearSession();
    state.loading = false;
    render();
    return;
  }

  try {
    const result = await apiRequest("/api/me");
    setSession(result.user);
    await loadUsers();
  } catch {
    clearSession();
  } finally {
    state.loading = false;
    render();
  }
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    navigate(routeButton.dataset.route);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;
  if (action === "toggle-menu") {
    state.menuOpen = !state.menuOpen;
    render();
  }
  if (action === "toggle-theme") {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    render();
  }
  if (action === "logout") {
    clearSession();
    showToast("Logged out.");
    navigate("/login");
  }
  if (action === "toggle-password") {
    const input = actionButton.closest(".password-field").querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
    actionButton.innerHTML = icon(input.type === "password" ? "eye" : "eye-off");
    window.lucide?.createIcons();
  }
  if (action === "delete-user") {
    const userId = actionButton.dataset.userId;
    apiRequest(`/api/users/${userId}`, { method: "DELETE" })
      .then((result) => {
        state.users = result.users;
        showToast("User deleted.");
        render();
      })
      .catch((error) => showToast(error.message, "error"));
  }
  if (action === "start-2fa") {
    startTwoFactorSetup();
  }
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.form === "login") handleLogin(form);
  if (form.dataset.form === "2fa-login") handleTwoFactorLogin(form);
  if (form.dataset.form === "register") handleRegister(form);
  if (form.dataset.form === "2fa-enable") handleEnableTwoFactor(form);
  if (form.dataset.form === "2fa-disable") handleDisableTwoFactor(form);
});

document.addEventListener("input", (event) => {
  if (event.target.matches('[data-action="search-users"]')) {
    state.search = event.target.value;
    render();
    document.querySelector('[data-action="search-users"]')?.focus();
  }
});

window.addEventListener("popstate", () => {
  state.route = window.location.pathname;
  render();
});

window.addEventListener("load", initializeGoogleSignIn);

bootstrapStorage();
hydrateSession();
