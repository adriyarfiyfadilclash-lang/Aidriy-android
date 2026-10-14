import { useEffect, useState } from 'react';
import { useApp } from '../../state';
import * as db from '../../lib/db';
import { PROVIDERS } from '../../lib/providers';
import { TopBar } from '../../components/ui';

const fmt = (n) => new Intl.NumberFormat('id-ID').format(n || 0);

export default function UsagePage() {
  const { showToast } = useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    db.counts().then(setTotals).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    db.usageSince(days)
      .then((rows) => {
        const byProv = {};
        const byDay = {};
        for (const r of rows) {
          const u = r.meta?.usage;
          const p = r.meta?.provider || u?.provider || 'lain';
          byProv[p] = byProv[p] || { replies: 0, input: 0, output: 0 };
          byProv[p].replies += 1;
          if (u) {
            byProv[p].input += u.input || 0;
            byProv[p].output += u.output || 0;
          }
          const d = r.created_at.slice(0, 10);
          byDay[d] = (byDay[d] || 0) + 1;
        }
        setData({ byProv, byDay, replies: rows.length });
      })
      .catch((e) => {
        showToast(e.message, 'error');
        setData({ byProv: {}, byDay: {}, replies: 0 });
      });
  }, [days, showToast]);

  const dayKeys = [];
  for (let i = Math.min(days, 14) - 1; i >= 0; i--) dayKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const max = Math.max(1, ...dayKeys.map((k) => data?.byDay[k] || 0));

  return (
    <div className="page">
      <TopBar back title={<span className="serif-title">Penggunaan</span>} />
      <main className="page-scroll">
        {totals && (
          <div className="stats">
            <div className="stat">
              <b>{fmt(totals.conversations)}</b>
              <span>Chat</span>
            </div>
            <div className="stat">
              <b>{fmt(totals.messages)}</b>
              <span>Pesan</span>
            </div>
            <div className="stat">
              <b>{fmt(totals.artifacts)}</b>
              <span>Artefak</span>
            </div>
            <div className="stat">
              <b>{fmt(totals.memories)}</b>
              <span>Memori</span>
            </div>
          </div>
        )}

        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {d} hari
            </button>
          ))}
        </div>

        {!data ? (
          <div className="center-fill">
            <span className="spinner" />
          </div>
        ) : (
          <>
            <div className="card">
              <div className="label">Jawaban AI per hari (14 hari terakhir)</div>
              <div className="bars">
                {dayKeys.map((k) => (
                  <div key={k} className="bar-col" title={`${k}: ${data.byDay[k] || 0}`}>
                    <div className="bar" style={{ height: `${((data.byDay[k] || 0) / max) * 100}%` }} />
                    <span>{k.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="section-title">Token per penyedia ({days} hari)</div>
            {Object.keys(data.byProv).length === 0 && <p className="muted pad">Belum ada pemakaian.</p>}
            {Object.entries(data.byProv).map(([p, v]) => (
              <div key={p} className="card">
                <div className="card-title">{PROVIDERS[p]?.name || p}</div>
                <div className="usage-row">
                  <span>Jawaban</span>
                  <b>{fmt(v.replies)}</b>
                </div>
                <div className="usage-row">
                  <span>Token masuk</span>
                  <b>{fmt(v.input)}</b>
                </div>
                <div className="usage-row">
                  <span>Token keluar</span>
                  <b>{fmt(v.output)}</b>
                </div>
              </div>
            ))}
            <p className="muted small pad-x">Biaya sebenarnya dapat dilihat di dasbor masing-masing penyedia. Chat incognito tidak dihitung.</p>
          </>
        )}
      </main>
    </div>
  );
}
