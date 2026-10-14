import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../state';
import { LogoMark } from '../components/Logo';

const EMAIL_KEY = 'aidriy.lastEmail';

function translate(msg) {
  if (/invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Buka tautan konfirmasi di emailmu dulu.';
  if (/already registered|already been registered/i.test(msg)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/password should be at least/i.test(msg)) return 'Kata sandi minimal 6 karakter.';
  if (/should be different/i.test(msg)) return 'Kata sandi baru harus berbeda dari yang lama.';
  if (/rate limit|too many/i.test(msg)) return 'Terlalu banyak percobaan atau email. Tunggu sekitar 1 jam lalu coba lagi.';
  if (/expired|invalid.*(token|otp)|otp.*(expired|invalid)/i.test(msg)) return 'Tautan sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.';
  if (/failed to fetch|network/i.test(msg)) return 'Tidak ada koneksi internet.';
  return msg;
}

// Ambil token dari tautan email atau dari alamat halaman setelah tautan dibuka.
function parseRecoveryLink(raw) {
  const text = String(raw || '').trim();
  const urlMatch = text.match(/https?:\/\/\S+/);
  const src = urlMatch ? urlMatch[0] : text;
  try {
    const u = new URL(src);
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
    const q = u.searchParams;
    if (hash.get('access_token') && hash.get('refresh_token')) {
      return { kind: 'session', access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') };
    }
    const errorDesc = hash.get('error_description') || q.get('error_description');
    if (errorDesc) return { kind: 'error', message: errorDesc.replace(/\+/g, ' ') };
    const tokenHash = q.get('token_hash') || q.get('token');
    if (tokenHash) return { kind: 'otp', token_hash: tokenHash, type: q.get('type') || 'recovery' };
  } catch {
    /* bukan URL */
  }
  return null;
}

export default function AuthPage() {
  const { showToast } = useApp();
  const [mode, setMode] = useState('login'); // login | register | reset | recover
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [link, setLink] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const go = (m) => {
    setMode(m);
    setInfo('');
    setError('');
    setPassword('');
    setPassword2('');
  };

  const rememberEmail = () => {
    try {
      localStorage.setItem(EMAIL_KEY, email.trim());
    } catch {
      /* abaikan */
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setInfo('');
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        rememberEmail();
      } else if (mode === 'register') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), nickname: name.trim().split(' ')[0] } },
        });
        if (err) throw err;
        rememberEmail();
        // Supabase tidak memberi error untuk email yang sudah terdaftar; tandanya: identities kosong.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('login');
          setPassword('');
          setError('Email ini sudah terdaftar, jadi tidak ada email baru yang dikirim. Silakan masuk, atau pakai "Lupa kata sandi" bila lupa.');
          return;
        }
        if (!data.session) {
          setMode('login');
          setInfo('Akun dibuat. Kami mengirim email konfirmasi dari Supabase (cek juga folder Spam/Promosi). Ketuk tautannya, lalu kembali ke sini untuk masuk.');
        }
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (err) throw err;
        rememberEmail();
        go('recover');
        setInfo('Email atur ulang dikirim (cek juga folder Spam/Promosi).');
      } else if (mode === 'recover') {
        if (password !== password2) throw new Error('Kedua kata sandi baru tidak sama.');
        const parsed = parseRecoveryLink(link);
        if (!parsed) throw new Error('Tautan tidak dikenali. Salin tautan "Reset Password" dari email, lalu tempel di sini.');
        if (parsed.kind === 'error') throw new Error(parsed.message);
        let res;
        if (parsed.kind === 'session') res = await supabase.auth.setSession({ access_token: parsed.access_token, refresh_token: parsed.refresh_token });
        else res = await supabase.auth.verifyOtp({ token_hash: parsed.token_hash, type: parsed.type });
        if (res.error) throw res.error;
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        showToast('Kata sandi baru disimpan. Kamu sudah masuk.');
      }
    } catch (err) {
      const msg = translate(err.message || 'Gagal');
      setError(msg);
      if (mode !== 'login') showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const title = { login: 'Masuk', register: 'Buat akun', reset: 'Lupa kata sandi', recover: 'Atur kata sandi baru' }[mode];
  const cta = { login: 'Masuk', register: 'Daftar', reset: 'Kirim email atur ulang', recover: 'Simpan & masuk' }[mode];

  const passwordField = (label, value, setValue, autoComplete) => (
    <label className="field">
      <span>{label}</span>
      <div className="input-with-btn">
        <input
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Minimal 6 karakter"
          required
          minLength={6}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label="Tampilkan kata sandi">
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </label>
  );

  return (
    <div className="auth">
      <div className="auth-top">
        <LogoMark size={56} />
        <h1 className="auth-title">A.I.DRIY</h1>
        <p className="auth-sub">Asisten AI pribadimu</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>{title}</h2>

        {mode === 'register' && (
          <label className="field">
            <span>Nama</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" required autoComplete="name" />
          </label>
        )}

        {mode !== 'recover' && (
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              required
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
        )}

        {(mode === 'login' || mode === 'register') && passwordField('Kata sandi', password, setPassword, mode === 'login' ? 'current-password' : 'new-password')}

        {mode === 'reset' && (
          <p className="auth-help">Kami kirim email berjudul "Reset Your Password" ke alamat di atas. Di langkah berikutnya kamu menempelkan tautannya di sini.</p>
        )}

        {mode === 'recover' && (
          <>
            <ol className="auth-steps">
              <li>Buka email "Reset Your Password" dari Supabase.</li>
              <li>
                <b>Tekan lama</b> tautan "Reset Password", pilih <b>Salin alamat link</b>.
              </li>
              <li>Tempel di bawah, lalu buat kata sandi baru.</li>
            </ol>
            <label className="field">
              <span>Tautan dari email</span>
              <textarea
                className="input textarea mono"
                rows={3}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://dcnpaofsxhcgrhzbwbqr.supabase.co/auth/v1/verify?token=…"
                required
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <small className="muted">Kalau tautannya sudah terlanjur dibuka dan muncul halaman error, salin alamat halaman itu dan tempel di sini.</small>
            </label>
            {passwordField('Kata sandi baru', password, setPassword, 'new-password')}
            {passwordField('Ulangi kata sandi baru', password2, setPassword2, 'new-password')}
          </>
        )}

        {info && <p className="auth-info">{info}</p>}
        {error && (
          <div className="auth-error" role="alert">
            {error}
            {mode === 'login' && /salah/.test(error) && (
              <button type="button" className="link-btn" onClick={() => go('reset')}>
                Lupa kata sandi? Atur ulang
              </button>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
          {busy ? <span className="spinner small light" /> : cta}
        </button>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button type="button" className="link-btn" onClick={() => go('register')}>
                Belum punya akun? Daftar
              </button>
              <button type="button" className="link-btn muted" onClick={() => go('reset')}>
                Lupa kata sandi
              </button>
            </>
          )}
          {mode === 'reset' && (
            <button type="button" className="link-btn muted" onClick={() => go('recover')}>
              Sudah punya tautan dari email? Tempel di sini
            </button>
          )}
          {mode !== 'login' && (
            <button type="button" className="link-btn" onClick={() => go('login')}>
              Kembali ke Masuk
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
