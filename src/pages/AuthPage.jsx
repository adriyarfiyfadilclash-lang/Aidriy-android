import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../state';
import { LogoMark } from '../components/Logo';

function translate(msg) {
  if (/invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Buka tautan konfirmasi di emailmu dulu.';
  if (/already registered|already been registered/i.test(msg)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/password should be at least/i.test(msg)) return 'Kata sandi minimal 6 karakter.';
  if (/rate limit/i.test(msg)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/failed to fetch/i.test(msg)) return 'Tidak ada koneksi internet.';
  return msg;
}

export default function AuthPage() {
  const { showToast } = useApp();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), nickname: name.trim().split(' ')[0] } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo('Akun dibuat. Buka email dari Supabase dan ketuk tautan konfirmasi, lalu kembali ke sini untuk masuk.');
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setInfo('Jika email terdaftar, tautan atur ulang kata sandi sudah dikirim.');
      }
    } catch (err) {
      showToast(translate(err.message || 'Gagal'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-top">
        <LogoMark size={56} />
        <h1 className="auth-title">A.I.DRIY</h1>
        <p className="auth-sub">Asisten AI pribadimu</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Masuk' : mode === 'register' ? 'Buat akun' : 'Lupa kata sandi'}</h2>
        {mode === 'register' && (
          <label className="field">
            <span>Nama</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" required autoComplete="email" />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            <span>Kata sandi</span>
            <div className="input-with-btn">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label="Tampilkan kata sandi">
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>
        )}
        {info && <p className="auth-info">{info}</p>}
        <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
          {busy ? <span className="spinner small light" /> : mode === 'login' ? 'Masuk' : mode === 'register' ? 'Daftar' : 'Kirim tautan'}
        </button>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <button type="button" className="link-btn" onClick={() => setMode('register')}>
                Belum punya akun? Daftar
              </button>
              <button type="button" className="link-btn muted" onClick={() => setMode('reset')}>
                Lupa kata sandi
              </button>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => setMode('login')}>
              Sudah punya akun? Masuk
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
