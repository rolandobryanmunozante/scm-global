import { Boxes, Eye, EyeOff, Globe2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, Modal } from "../components/ui";
import { Navigate } from "../router";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState("admin@scm.local");
  const [password, setPassword] = useState("SCM2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const switchLanguage = (language: string) => {
    void i18n.changeLanguage(language);
    localStorage.setItem("scm_language", language);
  };

  return (
    <div className="login-page">
      <div className="login-visual" aria-hidden="true">
        <div className="supply-grid" />
        <span className="login-orb orb-one" />
        <span className="login-orb orb-two" />
      </div>

      <div className="login-floating-brand">
        <div className="brand-mark"><Boxes size={23} /></div>
        <div><strong>SCM Global</strong><span>Control tower</span></div>
      </div>
      <main className="login-main">
        <div className="login-language">
          <Globe2 size={16} />
          <select value={i18n.language.slice(0, 2)} onChange={(event) => switchLanguage(event.target.value)}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-brand">
            <div className="brand-mark"><Boxes size={21} /></div><strong>SCM Global</strong>
          </div>
          <header>
            <div className="secure-chip"><ShieldCheck size={14} /> Acceso seguro</div>
            <h2>{t("login.title")}</h2>
            <p>{t("login.subtitle")}</p>
          </header>
          {error && <Alert>{error}</Alert>}
          <label className="login-field">
            <span>{t("login.email")}</span>
            <div>
              <Mail size={17} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </div>
          </label>
          <label className="login-field">
            <span>{t("login.password")}</span>
            <div>
              <LockKeyhole size={17} />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Mostrar contraseña">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : t("login.submit")}
          </button>
          <button className="forgot-link" type="button" onClick={() => setForgotOpen(true)}>{t("login.forgot")}</button>
          <div className="demo-access">
            <span>{t("login.demo")}</span>
            <p><strong>admin@scm.local</strong> · SCM2026!</p>
          </div>
        </form>
        <div className="network-status">
          <span className="live-dot" />
          <div><strong>Red operativa</strong><small>Inventario, compras y transporte conectados</small></div>
        </div>
        <p className="login-legal">Protegido con JWT · Sesiones de 30 minutos · Control por roles</p>
      </main>
      <ForgotPassword open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}

function ForgotPassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const { data } = await api.post<{ message: string; developmentToken?: string }>("/seguridad/forgot-password", { email });
      setMessage(data.developmentToken ? `${data.message} Código local: ${data.developmentToken}` : data.message);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Recuperar contraseña" width="460px">
      <p className="modal-intro">Ingrese su correo y enviaremos un enlace válido durante una hora.</p>
      {message && <Alert type="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit}>
        <div className="field"><label>Correo electrónico</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="submit">Enviar instrucciones</button>
        </div>
      </form>
    </Modal>
  );
}
