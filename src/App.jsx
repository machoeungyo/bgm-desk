import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   유틸
   ============================================================ */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function genGmKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function extractVideoId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

async function fetchTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        "https://www.youtube.com/watch?v=" + videoId
      )}&format=json`
    );
    if (!res.ok) throw new Error("oembed failed");
    const data = await res.json();
    return data.title || null;
  } catch (e) {
    return null;
  }
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ============================================================
   저장소 헬퍼 (window.storage, 모두 shared)
   ============================================================ */

async function getRoomIndex() {
  try {
    const r = await window.storage.get("rooms:index", true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveRoomIndex(list) {
  try {
    await window.storage.set("rooms:index", JSON.stringify(list), true);
  } catch (e) {}
}
async function getRoomState(id) {
  try {
    const r = await window.storage.get(`room:${id}:state`, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveRoomState(id, state) {
  try {
    await window.storage.set(`room:${id}:state`, JSON.stringify(state), true);
  } catch (e) {}
}
async function getGmKey(id) {
  try {
    const r = await window.storage.get(`room:${id}:gmkey`, true);
    return r ? r.value : null;
  } catch (e) {
    return null;
  }
}
async function saveGmKey(id, key) {
  try {
    await window.storage.set(`room:${id}:gmkey`, key, true);
  } catch (e) {}
}
async function deleteRoomKeys(id) {
  try {
    await window.storage.delete(`room:${id}:state`, true);
  } catch (e) {}
  try {
    await window.storage.delete(`room:${id}:gmkey`, true);
  } catch (e) {}
}

function initialRoomState(name) {
  return {
    name,
    tracks: [],
    folders: [],
    playback: {
      trackId: null,
      isPlaying: false,
      positionSec: 0,
      positionAtMs: Date.now(),
      loopMode: "none", // 'none' | 'repeatOne' | 'repeatAll'
    },
    version: Date.now(),
  };
}

/* ============================================================
   유튜브 IFrame API 로더
   ============================================================ */

let ytApiPromise = null;
function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCb === "function") prevCb();
      resolve(window.YT);
    };
    if (!document.querySelector('script[data-yt-iframe-api="1"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.setAttribute("data-yt-iframe-api", "1");
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

/* ============================================================
   스타일
   ============================================================ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

      .bgm-app {
        --bg: #15130E;
        --bg-elevated: #1D1911;
        --surface: #241F17;
        --surface-hover: #2C261B;
        --border: #3A3327;
        --brass: #C6963C;
        --brass-bright: #E8B75E;
        --ember: #B1502E;
        --good: #7A9A5C;
        --text: #EDE3CF;
        --text-dim: #A79A83;
        --text-faint: #6E6353;
        font-family: 'Inter', sans-serif;
        background: radial-gradient(1200px 800px at 20% -10%, #221C13 0%, var(--bg) 55%);
        color: var(--text);
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
      }
      .bgm-app *, .bgm-app *::before, .bgm-app *::after { box-sizing: border-box; }
      .bgm-app .font-display { font-family: 'Fraunces', Georgia, serif; }
      .bgm-app .font-mono { font-family: 'JetBrains Mono', monospace; }

      .bgm-app ::selection { background: var(--brass); color: #17130B; }

      .bgm-app .btn {
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: .01em;
        border-radius: 8px;
        padding: 8px 14px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
        transition: background .15s, border-color .15s, transform .1s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .bgm-app .btn:hover { background: var(--surface-hover); border-color: var(--brass); }
      .bgm-app .btn:active { transform: translateY(1px); }
      .bgm-app .btn:disabled { opacity: .4; cursor: not-allowed; }
      .bgm-app .btn-brass { background: var(--brass); border-color: var(--brass); color: #1B1206; }
      .bgm-app .btn-brass:hover { background: var(--brass-bright); border-color: var(--brass-bright); }
      .bgm-app .btn-ghost { background: transparent; border-color: transparent; color: var(--text-dim); }
      .bgm-app .btn-ghost:hover { background: var(--surface); color: var(--text); }
      .bgm-app .btn-danger { color: #D98466; border-color: #4A2A1E; }
      .bgm-app .btn-danger:hover { background: #2A180F; border-color: var(--ember); }
      .bgm-app .btn-icon { padding: 8px; }

      .bgm-app .input, .bgm-app select.input {
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 7px;
        padding: 8px 10px;
        outline: none;
        transition: border-color .15s;
        width: 100%;
      }
      .bgm-app .input:focus { border-color: var(--brass); }
      .bgm-app .input::placeholder { color: var(--text-faint); }

      .bgm-app .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 14px;
      }

      .bgm-app .label-eyebrow {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: var(--text-faint);
      }

      .bgm-app .divider { height: 1px; background: var(--border); border: none; }

      .bgm-app .scrollarea::-webkit-scrollbar { width: 8px; height: 8px; }
      .bgm-app .scrollarea::-webkit-scrollbar-track { background: transparent; }
      .bgm-app .scrollarea::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
      .bgm-app .scrollarea::-webkit-scrollbar-thumb:hover { background: var(--brass); }

      .bgm-app .track-row {
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        border-radius: 10px;
        transition: border-color .15s, background .15s, opacity .15s;
      }
      .bgm-app .track-row:hover { border-color: var(--brass); }
      .bgm-app .track-row.active { border-color: var(--brass); background: #2A2213; }
      .bgm-app .track-row.dragging { opacity: .35; }
      .bgm-app .drag-handle { cursor: grab; color: var(--text-faint); }
      .bgm-app .drag-handle:active { cursor: grabbing; }

      .bgm-app .folder-chip {
        font-size: 12px;
        font-weight: 600;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-dim);
        cursor: pointer;
        white-space: nowrap;
      }
      .bgm-app .folder-chip.active { background: var(--brass); border-color: var(--brass); color: #1B1206; }
      .bgm-app .folder-chip:hover:not(.active) { border-color: var(--brass); color: var(--text); }

      .bgm-app .badge-live {
        display: inline-flex; align-items: center; gap: 6px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px; color: var(--good);
      }
      .bgm-app .badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); box-shadow: 0 0 8px var(--good); }
      .bgm-app .badge-dot.off { background: var(--text-faint); box-shadow: none; }

      .bgm-app .seekbar {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 4px; border-radius: 4px;
        background: var(--border); outline: none; cursor: pointer;
      }
      .bgm-app .seekbar::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 13px; height: 13px; border-radius: 50%;
        background: var(--brass-bright); cursor: pointer; margin-top: -4.5px;
        box-shadow: 0 0 0 3px rgba(198,150,60,.18);
      }
      .bgm-app .seekbar::-moz-range-thumb {
        width: 13px; height: 13px; border-radius: 50%; border: none;
        background: var(--brass-bright); cursor: pointer;
      }
      .bgm-app .seekbar::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; }

      .bgm-app .progress-track {
        width: 100%; height: 4px; border-radius: 4px; background: var(--border); overflow: hidden;
      }
      .bgm-app .progress-fill { height: 100%; background: var(--brass); transition: width .3s linear; }

      .bgm-app .reel-wrap svg { display: block; transition: filter .4s; }
      .bgm-app .reel-wrap.spinning svg { animation: bgm-spin 3.4s linear infinite; filter: drop-shadow(0 0 14px rgba(198,150,60,.5)); }
      @keyframes bgm-spin { to { transform: rotate(360deg); } }

      .bgm-app .yt-box { border-radius: 12px; overflow: hidden; background: #000; border: 1px solid var(--border); }

      .bgm-app .join-overlay {
        position: absolute; inset: 0; background: rgba(21,19,14,.86);
        display: flex; align-items: center; justify-content: center; border-radius: 14px; z-index: 5;
      }

      .bgm-app .room-tile {
        background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px;
        transition: border-color .15s, transform .15s;
      }
      .bgm-app .room-tile:hover { border-color: var(--brass); transform: translateY(-2px); }

      .bgm-app textarea.input { resize: vertical; min-height: 44px; }

      @media (max-width: 860px) {
        .bgm-app .gm-body { flex-direction: column; }
        .bgm-app .gm-sidebar { width: 100% !important; max-height: none !important; }
      }
    `}</style>
  );
}

/* ============================================================
   릴(Reel) 인디케이터 — 시그니처 비주얼
   ============================================================ */

function Reel({ playing, size = 108 }) {
  const ticks = Array.from({ length: 18 });
  return (
    <div className={"reel-wrap" + (playing ? " spinning" : "")} style={{ width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="39" fill="var(--bg-elevated)" stroke="var(--brass)" strokeWidth="1.4" />
        {ticks.map((_, i) => {
          const angle = (i / ticks.length) * Math.PI * 2;
          const x1 = 50 + Math.cos(angle) * 31;
          const y1 = 50 + Math.sin(angle) * 31;
          const x2 = 50 + Math.cos(angle) * 38;
          const y2 = 50 + Math.sin(angle) * 38;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth="1.2" />;
        })}
        <circle cx="50" cy="50" r="11" fill="var(--brass)" />
        <circle cx="50" cy="50" r="3.2" fill="var(--bg)" />
      </svg>
    </div>
  );
}

/* ============================================================
   홈 화면
   ============================================================ */

function Home({ onEnterRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState(null); // {id, name, key}
  const [joinInputs, setJoinInputs] = useState({});
  const [joinErrors, setJoinErrors] = useState({});

  const refresh = useCallback(async () => {
    const list = await getRoomIndex();
    setRooms(list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const id = uid();
    const key = genGmKey();
    const state = initialRoomState(newName.trim());
    const list = await getRoomIndex();
    const nextList = [...list, { id, name: newName.trim(), createdAt: Date.now() }];
    await saveRoomIndex(nextList);
    await saveRoomState(id, state);
    await saveGmKey(id, key);
    setRooms(nextList.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setCreatedInfo({ id, name: newName.trim(), key });
    setNewName("");
    setCreating(false);
  }

  async function handleJoin(room) {
    const typed = (joinInputs[room.id] || "").trim();
    if (!typed) {
      onEnterRoom(room.id, "pl", null);
      return;
    }
    const key = await getGmKey(room.id);
    if (key && typed.toUpperCase() === key.toUpperCase()) {
      onEnterRoom(room.id, "gm", key);
    } else {
      setJoinErrors((prev) => ({ ...prev, [room.id]: "GM 키가 올바르지 않아요." }));
    }
  }

  async function handleDelete(room) {
    if (!window.confirm(`"${room.name}" 세션을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const list = await getRoomIndex();
    const next = list.filter((r) => r.id !== room.id);
    await saveRoomIndex(next);
    await deleteRoomKeys(room.id);
    setRooms(next.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  }

  return (
    <div className="bgm-app" style={{ padding: "48px 20px 80px" }}>
      <GlobalStyle />
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div className="label-eyebrow" style={{ marginBottom: 8 }}>SESSION BOARD</div>
          <h1 className="font-display" style={{ fontSize: 40, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
            세션 브금 데크
          </h1>
          <p style={{ color: "var(--text-dim)", marginTop: 10, fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
            룸을 만들어 유튜브 링크로 재생목록을 꾸리고, GM이 재생·정지하면 플레이어 전원에게 실시간으로 맞춰 흘러가요.
          </p>
        </div>

        {createdInfo && (
          <div
            className="card"
            style={{ padding: 18, marginBottom: 28, borderColor: "var(--brass)", background: "#241C10" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="label-eyebrow" style={{ color: "var(--brass-bright)", marginBottom: 6 }}>
                  세션 생성 완료 · "{createdInfo.name}"
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, lineHeight: 1.6 }}>
                  아래 GM 키를 잃어버리면 다시 GM 권한을 얻을 수 없어요. 꼭 안전한 곳에 적어두세요.
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 22,
                    letterSpacing: "0.18em",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 16px",
                    display: "inline-block",
                    color: "var(--brass-bright)",
                  }}
                >
                  {createdInfo.key}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => setCreatedInfo(null)}>닫기</button>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                className="btn btn-brass"
                onClick={() => onEnterRoom(createdInfo.id, "gm", createdInfo.key)}
              >
                이 키로 GM 입장하기 →
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(createdInfo.key).catch(() => {});
                }}
              >
                키 복사
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="card" style={{ padding: 18, marginBottom: 32, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px" }}>
            <input
              className="input"
              placeholder="새 세션 이름 (예: 안개의 숲 3일차)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button className="btn btn-brass" type="submit" disabled={creating || !newName.trim()}>
            + 새 세션 만들기
          </button>
        </form>

        <div className="label-eyebrow" style={{ marginBottom: 14 }}>진행 중인 세션 · {rooms.length}</div>

        {loading ? (
          <div style={{ color: "var(--text-faint)", fontSize: 13 }}>불러오는 중…</div>
        ) : rooms.length === 0 ? (
          <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
            아직 세션이 없어요. 위에서 첫 세션을 만들어보세요.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {rooms.map((room) => (
              <div key={room.id} className="room-tile">
                <div className="font-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>{room.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 14 }} className="font-mono">
                  ROOM · {room.id.slice(0, 8)}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    placeholder="GM 키 (없으면 참가자)"
                    value={joinInputs[room.id] || ""}
                    onChange={(e) => {
                      setJoinInputs((prev) => ({ ...prev, [room.id]: e.target.value }));
                      setJoinErrors((prev) => ({ ...prev, [room.id]: "" }));
                    }}
                    style={{ fontSize: 12 }}
                  />
                  <button className="btn btn-brass" onClick={() => handleJoin(room)} style={{ flexShrink: 0 }}>
                    입장
                  </button>
                </div>
                {joinErrors[room.id] && (
                  <div style={{ color: "var(--ember)", fontSize: 11, marginTop: 6 }}>{joinErrors[room.id]}</div>
                )}
                <button
                  className="btn btn-ghost btn-danger"
                  style={{ marginTop: 10, fontSize: 11, padding: "4px 8px" }}
                  onClick={() => handleDelete(room)}
                >
                  세션 삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   AB(구간) 반복 패널
   ============================================================ */

function AbLoopPanel({ track, isCurrent, getLiveTime, onChange }) {
  const tl = track.timestampLoop || { enabled: false, start: 0, end: 0 };
  const [start, setStart] = useState(tl.start || 0);
  const [end, setEnd] = useState(tl.end || 0);

  useEffect(() => {
    setStart(tl.start || 0);
    setEnd(tl.end || 0);
  }, [track.id]); // eslint-disable-line

  function commit(patch) {
    onChange({ ...tl, ...patch });
  }

  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: 8, marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
          <input
            type="checkbox"
            checked={!!tl.enabled}
            onChange={(e) => commit({ enabled: e.target.checked })}
          />
          구간 반복 사용
        </label>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {formatTime(tl.start || 0)} → {formatTime(tl.end || 0)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="label-eyebrow" style={{ marginBottom: 4 }}>시작(초)</div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="number"
              min="0"
              className="input"
              style={{ fontSize: 12 }}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              onBlur={() => commit({ start })}
            />
            {isCurrent && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "6px 8px" }}
                onClick={() => {
                  const t = Math.floor(getLiveTime());
                  setStart(t);
                  commit({ start: t });
                }}
              >
                현재
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="label-eyebrow" style={{ marginBottom: 4 }}>끝(초)</div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="number"
              min="0"
              className="input"
              style={{ fontSize: 12 }}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              onBlur={() => commit({ end })}
            />
            {isCurrent && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "6px 8px" }}
                onClick={() => {
                  const t = Math.floor(getLiveTime());
                  setEnd(t);
                  commit({ end: t });
                }}
              >
                현재
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   트랙 행 (GM 전용 리스트)
   ============================================================ */

function TrackRow({
  track,
  isCurrent,
  isPlaying,
  folders,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
  onPlay,
  onUpdate,
  onDelete,
  getLiveTime,
}) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(track.description || "");
  const [showAb, setShowAb] = useState(false);

  return (
    <div
      className={"track-row" + (isCurrent ? " active" : "") + (dragging ? " dragging" : "")}
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, track.id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, track.id)}
      style={{ padding: 10, marginBottom: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {draggable && <span className="drag-handle" title="드래그해서 순서 변경">⠿</span>}
        <button
          className="btn btn-icon btn-ghost"
          onClick={() => onPlay(track)}
          title="이 트랙 재생"
          style={{ fontSize: 13 }}
        >
          {isCurrent && isPlaying ? "❚❚" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: isCurrent ? "var(--brass-bright)" : "var(--text)",
            }}
            title={track.title}
          >
            {track.title}
          </div>
          {track.timestampLoop?.enabled && (
            <div className="font-mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>
              구간반복 {formatTime(track.timestampLoop.start)}–{formatTime(track.timestampLoop.end)}
            </div>
          )}
        </div>
        <select
          className="input"
          style={{ width: 100, fontSize: 11, padding: "5px 6px" }}
          value={track.folderId || ""}
          onChange={(e) => onUpdate(track.id, { folderId: e.target.value || null })}
        >
          <option value="">미분류</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 7px" }} onClick={() => setShowAb((v) => !v)}>
          구간
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 7px" }} onClick={() => setEditingDesc((v) => !v)}>
          설명
        </button>
        <button className="btn btn-ghost btn-danger" style={{ fontSize: 11, padding: "5px 7px" }} onClick={() => onDelete(track.id)}>
          삭제
        </button>
      </div>

      {editingDesc && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            className="input"
            style={{ fontSize: 12 }}
            placeholder="간단한 설명 (예: 전투, 긴장감)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button
            className="btn btn-brass"
            style={{ fontSize: 11 }}
            onClick={() => {
              onUpdate(track.id, { description: desc });
              setEditingDesc(false);
            }}
          >
            저장
          </button>
        </div>
      )}
      {!editingDesc && track.description && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-dim)", paddingLeft: 30 }}>
          “{track.description}”
        </div>
      )}

      {showAb && (
        <AbLoopPanel
          track={track}
          isCurrent={isCurrent}
          getLiveTime={getLiveTime}
          onChange={(tl) => onUpdate(track.id, { timestampLoop: tl })}
        />
      )}
    </div>
  );
}

/* ============================================================
   룸 화면 (GM + PL 공용 셸)
   ============================================================ */

const LOOP_LABELS = { none: "순차재생", repeatOne: "한 곡 반복", repeatAll: "전체 반복" };

function Room({ roomId, role, gmKey, onExit }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [joined, setJoined] = useState(role === "gm");
  const [volume, setVolume] = useState(70);

  const stateRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const lastLoadedVideoIdRef = useRef(null);
  const joinedRef = useRef(role === "gm");

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  /* ---- 초기 로드 ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await getRoomState(roomId);
      const s = remote || initialRoomState("이름없는 세션");
      if (cancelled) return;
      stateRef.current = s;
      setState(s);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  /* ---- 플레이어 생성 ---- */
  useEffect(() => {
    let destroyed = false;
    loadYT().then((YT) => {
      if (destroyed || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: role === "gm" ? 1 : 0 },
        events: {
          onReady: (e) => {
            if (destroyed) return;
            e.target.setVolume(volume);
            if (role === "pl") e.target.mute();
            setPlayerReady(true);
          },
          onStateChange: (e) => {
            if (role === "gm") handleGmStateChangeRef.current(e);
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try {
        playerRef.current && playerRef.current.destroy();
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /* ---- 상태 갱신 헬퍼 ---- */
  const persist = useCallback(
    (next) => {
      stateRef.current = next;
      setState(next);
      saveRoomState(roomId, next);
    },
    [roomId]
  );

  const patchState = useCallback(
    (updater) => {
      const prev = stateRef.current;
      const merged = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      persist({ ...merged, version: Date.now() });
    },
    [persist]
  );

  const updatePlayback = useCallback(
    (patch) => {
      const prev = stateRef.current;
      persist({ ...prev, playback: { ...prev.playback, ...patch }, version: Date.now() });
    },
    [persist]
  );

  /* ---- 재생 제어 (GM) ---- */
  const playTrack = useCallback(
    (track, atSec = 0) => {
      const p = playerRef.current;
      if (!p || !track) return;
      lastLoadedVideoIdRef.current = track.videoId;
      p.loadVideoById({ videoId: track.videoId, startSeconds: Math.max(0, atSec) });
      updatePlayback({ trackId: track.id, isPlaying: true, positionSec: atSec, positionAtMs: Date.now() });
    },
    [updatePlayback]
  );

  const pauseCurrent = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    let pos = stateRef.current.playback.positionSec;
    try {
      pos = p.getCurrentTime();
    } catch (e) {}
    p.pauseVideo();
    updatePlayback({ isPlaying: false, positionSec: pos, positionAtMs: Date.now() });
  }, [updatePlayback]);

  const resumeCurrent = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.playVideo();
    let pos = stateRef.current.playback.positionSec;
    try {
      pos = p.getCurrentTime();
    } catch (e) {}
    updatePlayback({ isPlaying: true, positionSec: pos, positionAtMs: Date.now() });
  }, [updatePlayback]);

  const seekCurrent = useCallback(
    (sec) => {
      const p = playerRef.current;
      if (!p) return;
      p.seekTo(sec, true);
      updatePlayback({ positionSec: sec, positionAtMs: Date.now() });
    },
    [updatePlayback]
  );

  const goRelative = useCallback(
    (delta) => {
      const { tracks, playback } = stateRef.current;
      if (tracks.length === 0) return;
      let idx = tracks.findIndex((t) => t.id === playback.trackId);
      idx = idx === -1 ? 0 : idx + delta;
      if (idx < 0) idx = tracks.length - 1;
      if (idx >= tracks.length) {
        if (playback.loopMode === "repeatAll") idx = 0;
        else {
          pauseCurrent();
          return;
        }
      }
      const t = tracks[idx];
      const start = t.timestampLoop?.enabled ? t.timestampLoop.start : 0;
      playTrack(t, start);
    },
    [playTrack, pauseCurrent]
  );

  const handleTrackEndedRef = useRef();
  handleTrackEndedRef.current = () => {
    const { tracks, playback } = stateRef.current;
    const cur = tracks.find((t) => t.id === playback.trackId);
    if (cur?.timestampLoop?.enabled) {
      playTrack(cur, cur.timestampLoop.start);
      return;
    }
    if (playback.loopMode === "repeatOne") {
      playTrack(cur, 0);
      return;
    }
    if (playback.loopMode === "repeatAll") {
      goRelative(1);
      return;
    }
    const idx = tracks.findIndex((t) => t.id === playback.trackId);
    if (idx >= 0 && idx < tracks.length - 1) {
      goRelative(1);
    } else {
      updatePlayback({ isPlaying: false });
    }
  };

  const handleGmStateChangeRef = useRef(() => {});
  handleGmStateChangeRef.current = (e) => {
    if (!window.YT) return;
    if (e.data === window.YT.PlayerState.ENDED) {
      handleTrackEndedRef.current();
    }
  };

  /* ---- 구간(AB) 반복 감시 (GM) ---- */
  useEffect(() => {
    if (role !== "gm") return;
    const iv = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      const { tracks, playback } = stateRef.current;
      if (!playback.isPlaying) return;
      const cur = tracks.find((t) => t.id === playback.trackId);
      if (cur?.timestampLoop?.enabled && cur.timestampLoop.end > cur.timestampLoop.start) {
        let t = 0;
        try {
          t = p.getCurrentTime();
        } catch (e) {}
        if (t >= cur.timestampLoop.end - 0.15) {
          p.seekTo(cur.timestampLoop.start, true);
          updatePlayback({ positionSec: cur.timestampLoop.start, positionAtMs: Date.now() });
        }
      }
    }, 350);
    return () => clearInterval(iv);
  }, [role, updatePlayback]);

  /* ---- 원격 상태 반영 → 플레이어 (양쪽) ---- */
  const applyPlaybackToPlayer = useCallback(
    (playback, tracks) => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      const track = tracks.find((t) => t.id === playback.trackId);
      if (!track) return;
      const expected = playback.isPlaying
        ? playback.positionSec + (Date.now() - playback.positionAtMs) / 1000
        : playback.positionSec;

      if (lastLoadedVideoIdRef.current !== track.videoId) {
        lastLoadedVideoIdRef.current = track.videoId;
        if (joinedRef.current) {
          p.loadVideoById({ videoId: track.videoId, startSeconds: Math.max(0, expected) });
          if (!playback.isPlaying) setTimeout(() => { try { p.pauseVideo(); } catch (e) {} }, 500);
        } else {
          p.cueVideoById({ videoId: track.videoId, startSeconds: Math.max(0, expected) });
        }
        return;
      }
      if (!joinedRef.current) return;
      let actual = 0;
      let pstate = -1;
      try {
        actual = p.getCurrentTime();
        pstate = p.getPlayerState();
      } catch (e) {}
      if (Math.abs(actual - expected) > 1.5) {
        p.seekTo(Math.max(0, expected), true);
      }
      if (playback.isPlaying && pstate !== 1) {
        p.playVideo();
      }
      if (!playback.isPlaying && pstate === 1) {
        p.pauseVideo();
      }
    },
    []
  );

  useEffect(() => {
    if (!loaded) return;
    const intervalMs = role === "gm" ? 4000 : 1500;
    let stopped = false;
    const iv = setInterval(async () => {
      const remote = await getRoomState(roomId);
      if (!remote || stopped) return;
      if (remote.version > stateRef.current.version) {
        stateRef.current = remote;
        setState(remote);
      }
      applyPlaybackToPlayer(stateRef.current.playback, stateRef.current.tracks);
      setLastSync(Date.now());
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [loaded, role, roomId, applyPlaybackToPlayer, joined]);

  /* ---- 진행바 업데이트 ---- */
  useEffect(() => {
    const iv = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      try {
        setElapsed(p.getDuration() ? p.getCurrentTime() : 0);
        setDuration(p.getDuration() || 0);
      } catch (e) {}
    }, 500);
    return () => clearInterval(iv);
  }, []);

  /* ---- 볼륨 ---- */
  useEffect(() => {
    const p = playerRef.current;
    if (p && p.setVolume) {
      try {
        p.setVolume(volume);
      } catch (e) {}
    }
  }, [volume, playerReady]);

  function handleJoinClick() {
    setJoined(true);
    joinedRef.current = true;
    const p = playerRef.current;
    if (p) {
      try {
        p.unMute();
        p.setVolume(volume);
      } catch (e) {}
    }
    lastLoadedVideoIdRef.current = null; // 강제 재적용
  }

  if (!loaded || !state) {
    return (
      <div className="bgm-app" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <div style={{ color: "var(--text-faint)", fontSize: 13 }}>세션을 불러오는 중…</div>
      </div>
    );
  }

  return role === "gm" ? (
    <GmConsole
      roomId={roomId}
      gmKey={gmKey}
      state={state}
      stateRef={stateRef}
      patchState={patchState}
      updatePlayback={updatePlayback}
      playTrack={playTrack}
      pauseCurrent={pauseCurrent}
      resumeCurrent={resumeCurrent}
      seekCurrent={seekCurrent}
      goRelative={goRelative}
      containerRef={containerRef}
      elapsed={elapsed}
      duration={duration}
      volume={volume}
      setVolume={setVolume}
      onExit={onExit}
    />
  ) : (
    <PlView
      state={state}
      containerRef={containerRef}
      joined={joined}
      onJoin={handleJoinClick}
      elapsed={elapsed}
      duration={duration}
      volume={volume}
      setVolume={setVolume}
      lastSync={lastSync}
      onExit={onExit}
    />
  );
}

/* ============================================================
   GM 콘솔
   ============================================================ */

function GmConsole({
  roomId,
  gmKey,
  state,
  stateRef,
  patchState,
  updatePlayback,
  playTrack,
  pauseCurrent,
  resumeCurrent,
  seekCurrent,
  goRelative,
  containerRef,
  elapsed,
  duration,
  volume,
  setVolume,
  onExit,
}) {
  const [urlInput, setUrlInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [filterFolder, setFilterFolder] = useState("all");
  const [draggingId, setDraggingId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(state.name);
  const [importMsg, setImportMsg] = useState("");
  const [showKey, setShowKey] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => setNameInput(state.name), [state.name]);

  const currentTrack = state.tracks.find((t) => t.id === state.playback.trackId) || null;

  async function handleAddTrack(e) {
    e.preventDefault();
    const vid = extractVideoId(urlInput);
    if (!vid) {
      setAddError("올바른 유튜브 링크가 아니에요.");
      return;
    }
    setAddError("");
    setAdding(true);
    const title = await fetchTitle(vid);
    const track = {
      id: uid(),
      videoId: vid,
      url: urlInput.trim(),
      title: title || `영상 (${vid})`,
      description: descInput.trim(),
      folderId: filterFolder !== "all" && filterFolder !== "none" ? filterFolder : null,
      timestampLoop: { enabled: false, start: 0, end: 0 },
    };
    patchState((prev) => ({ ...prev, tracks: [...prev.tracks, track] }));
    setUrlInput("");
    setDescInput("");
    setAdding(false);
  }

  function addFolder(e) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    patchState((prev) => ({ ...prev, folders: [...prev.folders, { id: uid(), name: newFolder.trim() }] }));
    setNewFolder("");
  }
  function renameFolder(id, name) {
    patchState((prev) => ({ ...prev, folders: prev.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
  }
  function deleteFolder(id) {
    patchState((prev) => ({
      ...prev,
      folders: prev.folders.filter((f) => f.id !== id),
      tracks: prev.tracks.map((t) => (t.folderId === id ? { ...t, folderId: null } : t)),
    }));
    if (filterFolder === id) setFilterFolder("all");
  }
  function updateTrack(id, patch) {
    patchState((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }
  function deleteTrack(id) {
    patchState((prev) => ({ ...prev, tracks: prev.tracks.filter((t) => t.id !== id) }));
    if (stateRef.current.playback.trackId === id) {
      pauseCurrent();
      updatePlayback({ trackId: null, positionSec: 0 });
    }
  }
  function commitName() {
    setEditingName(false);
    if (nameInput.trim() && nameInput.trim() !== state.name) {
      patchState((prev) => ({ ...prev, name: nameInput.trim() }));
      getRoomIndex().then((list) => {
        const next = list.map((r) => (r.id === roomId ? { ...r, name: nameInput.trim() } : r));
        saveRoomIndex(next);
      });
    }
  }

  function onDragStartRow(e, id) {
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  }
  function onDragOverRow(e) {
    e.preventDefault();
  }
  function onDropRow(e, targetId) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    patchState((prev) => {
      const tracks = [...prev.tracks];
      const from = tracks.findIndex((t) => t.id === sourceId);
      const to = tracks.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      return { ...prev, tracks };
    });
  }

  function exportJson() {
    const data = { name: state.name, folders: state.folders, tracks: state.tracks };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.name || "bgm"}-playlist.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const folders = Array.isArray(data.folders) ? data.folders.map((f) => ({ id: f.id || uid(), name: f.name || "폴더" })) : [];
        const tracks = Array.isArray(data.tracks)
          ? data.tracks
              .map((t) => ({
                id: t.id || uid(),
                videoId: t.videoId || extractVideoId(t.url || ""),
                url: t.url || "",
                title: t.title || "제목 없음",
                description: t.description || "",
                folderId: t.folderId || null,
                timestampLoop: t.timestampLoop || { enabled: false, start: 0, end: 0 },
              }))
              .filter((t) => t.videoId)
          : [];
        patchState((prev) => ({ ...prev, folders, tracks }));
        setImportMsg(`${tracks.length}개 트랙을 불러왔어요.`);
      } catch (e) {
        setImportMsg("JSON 파일을 읽는 데 실패했어요.");
      }
      setTimeout(() => setImportMsg(""), 3500);
    };
    reader.readAsText(file);
  }

  const displayedTracks = state.tracks.filter((t) => {
    if (filterFolder === "all") return true;
    if (filterFolder === "none") return !t.folderId;
    return t.folderId === filterFolder;
  });

  const getLiveTime = () => {
    const p = containerRef.current;
    try {
      return p && p._ytPlayerRef ? p._ytPlayerRef.getCurrentTime() : elapsed;
    } catch (e) {
      return elapsed;
    }
  };

  return (
    <div className="bgm-app" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalStyle />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 22px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button className="btn btn-ghost btn-icon" onClick={onExit} title="세션 목록으로">←</button>
          {editingName ? (
            <input
              className="input font-display"
              style={{ fontSize: 18, fontWeight: 600, maxWidth: 320 }}
              value={nameInput}
              autoFocus
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
            />
          ) : (
            <h1
              className="font-display"
              style={{ fontSize: 20, fontWeight: 600, margin: 0, cursor: "pointer" }}
              onClick={() => setEditingName(true)}
              title="클릭해서 이름 수정"
            >
              {state.name} <span style={{ fontSize: 12, color: "var(--text-faint)" }}>✎</span>
            </h1>
          )}
          <span className="label-eyebrow" style={{ background: "var(--surface)", padding: "3px 8px", borderRadius: 999 }}>GM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowKey((v) => !v)}>
            {showKey ? gmKey : "GM 키 보기"}
          </button>
        </div>
      </header>

      <div className="gm-body" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 사이드바 */}
        <aside
          className="gm-sidebar scrollarea"
          style={{ width: 380, borderRight: "1px solid var(--border)", padding: 18, overflowY: "auto", maxHeight: "calc(100vh - 60px)" }}
        >
          <form onSubmit={handleAddTrack} className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div className="label-eyebrow" style={{ marginBottom: 8 }}>트랙 추가</div>
            <input
              className="input"
              placeholder="유튜브 링크 붙여넣기"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <input
              className="input"
              placeholder="설명 (선택, 예: 폭풍우 치는 밤)"
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {addError && <div style={{ color: "var(--ember)", fontSize: 12, marginBottom: 8 }}>{addError}</div>}
            <button className="btn btn-brass" type="submit" disabled={adding} style={{ width: "100%", justifyContent: "center" }}>
              {adding ? "제목 불러오는 중…" : "+ 재생목록에 추가"}
            </button>
          </form>

          <div style={{ marginBottom: 14 }}>
            <div className="label-eyebrow" style={{ marginBottom: 8 }}>폴더</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <button className={"folder-chip" + (filterFolder === "all" ? " active" : "")} onClick={() => setFilterFolder("all")}>
                전체 {state.tracks.length}
              </button>
              <button className={"folder-chip" + (filterFolder === "none" ? " active" : "")} onClick={() => setFilterFolder("none")}>
                미분류
              </button>
              {state.folders.map((f) => (
                <button
                  key={f.id}
                  className={"folder-chip" + (filterFolder === f.id ? " active" : "")}
                  onClick={() => setFilterFolder(f.id)}
                  onDoubleClick={() => {
                    const name = window.prompt("폴더 이름 수정", f.name);
                    if (name) renameFolder(f.id, name);
                  }}
                  title="더블클릭: 이름 수정"
                >
                  {f.name}
                </button>
              ))}
            </div>
            <form onSubmit={addFolder} style={{ display: "flex", gap: 6 }}>
              <input className="input" placeholder="새 폴더 이름" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} style={{ fontSize: 12 }} />
              <button className="btn" type="submit" style={{ fontSize: 12 }}>추가</button>
              {filterFolder !== "all" && filterFolder !== "none" && (
                <button type="button" className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => deleteFolder(filterFolder)}>
                  폴더삭제
                </button>
              )}
            </form>
          </div>

          <div className="label-eyebrow" style={{ marginBottom: 8 }}>
            재생목록 {filterFolder !== "all" && <span>(순서 변경은 전체 보기에서만 가능해요)</span>}
          </div>
          <div>
            {displayedTracks.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "12px 4px" }}>표시할 트랙이 없어요.</div>
            )}
            {displayedTracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                isCurrent={state.playback.trackId === t.id}
                isPlaying={state.playback.isPlaying}
                folders={state.folders}
                draggable={filterFolder === "all"}
                dragging={draggingId === t.id}
                onDragStart={onDragStartRow}
                onDragOver={onDragOverRow}
                onDrop={onDropRow}
                onPlay={(track) => {
                  if (state.playback.trackId === track.id) {
                    state.playback.isPlaying ? pauseCurrent() : resumeCurrent();
                  } else {
                    const start = track.timestampLoop?.enabled ? track.timestampLoop.start : 0;
                    playTrack(track, start);
                  }
                }}
                onUpdate={updateTrack}
                onDelete={deleteTrack}
                getLiveTime={() => elapsed}
              />
            ))}
          </div>

          <hr className="divider" style={{ margin: "16px 0" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 12 }} onClick={exportJson}>
              JSON 내보내기
            </button>
            <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
              JSON 불러오기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => e.target.files[0] && importJson(e.target.files[0])}
            />
          </div>
          {importMsg && <div style={{ fontSize: 11, color: "var(--brass-bright)", marginTop: 6 }}>{importMsg}</div>}
        </aside>

        {/* 메인 덱 */}
        <main style={{ flex: 1, padding: 26, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
          <div style={{ width: "100%", maxWidth: 560 }}>
            <div className="yt-box" style={{ width: "100%", aspectRatio: "16/9", marginBottom: 20 }}>
              <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
              <Reel playing={state.playback.isPlaying} size={72} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="font-display" style={{ fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentTrack ? currentTrack.title : "재생할 트랙을 선택하세요"}
                </div>
                {currentTrack?.description && (
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>“{currentTrack.description}”</div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <input
                type="range"
                className="seekbar"
                min={0}
                max={duration || 0}
                step={0.5}
                value={Math.min(elapsed, duration || 0)}
                onChange={(e) => seekCurrent(Number(e.target.value))}
                disabled={!currentTrack}
              />
              <div className="font-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                <span>{formatTime(elapsed)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
              <button className="btn btn-icon" onClick={() => goRelative(-1)} disabled={!state.tracks.length} title="이전 트랙">⏮</button>
              <button
                className="btn btn-brass btn-icon"
                style={{ width: 46, height: 46, borderRadius: "50%", justifyContent: "center", fontSize: 16 }}
                onClick={() => {
                  if (!currentTrack) return;
                  state.playback.isPlaying ? pauseCurrent() : resumeCurrent();
                }}
                disabled={!currentTrack}
                title="재생/일시정지"
              >
                {state.playback.isPlaying ? "❚❚" : "▶"}
              </button>
              <button className="btn btn-icon" onClick={() => goRelative(1)} disabled={!state.tracks.length} title="다음 트랙">⏭</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(LOOP_LABELS).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={"folder-chip" + (state.playback.loopMode === mode ? " active" : "")}
                    onClick={() => updatePlayback({ loopMode: mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>🔊</span>
                <input
                  type="range"
                  className="seekbar"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ marginTop: 26, fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
              참가자에게는 재생목록이 보이지 않고, 지금 재생 중인 트랙만 약 1~2초 간격으로 동기화돼요.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   PL(참가자) 화면
   ============================================================ */

function PlView({ state, containerRef, joined, onJoin, elapsed, duration, volume, setVolume, lastSync, onExit }) {
  const currentTrack = state.tracks.find((t) => t.id === state.playback.trackId) || null;
  const secondsAgo = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;

  return (
    <div className="bgm-app" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <GlobalStyle />
      <header style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={onExit} title="세션 목록으로">←</button>
          <h1 className="font-display" style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>{state.name}</h1>
          <span className="label-eyebrow" style={{ background: "var(--surface)", padding: "3px 8px", borderRadius: 999 }}>PLAYER</span>
        </div>
        <div className="badge-live">
          <span className={"badge-dot" + (secondsAgo === null || secondsAgo > 6 ? " off" : "")} />
          {secondsAgo === null ? "연결 중" : `동기화됨 · ${secondsAgo}초 전`}
        </div>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 560, padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <div className="yt-box" style={{ width: "100%", aspectRatio: "16/9", marginBottom: 26, position: "relative" }}>
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
          {!joined && (
            <div className="join-overlay">
              <div style={{ textAlign: "center" }}>
                <Reel playing={false} size={64} />
                <div style={{ margin: "14px 0 18px", fontSize: 13, color: "var(--text-dim)" }}>
                  세션에 참가하면 GM의 재생에 실시간으로 맞춰져요
                </div>
                <button className="btn btn-brass" onClick={onJoin}>🔊 세션 참가하기</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, width: "100%", marginBottom: 16 }}>
          <Reel playing={state.playback.isPlaying && joined} size={80} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="label-eyebrow" style={{ marginBottom: 4 }}>
              {state.playback.isPlaying ? "재생 중" : currentTrack ? "일시정지" : "대기 중"}
            </div>
            <div className="font-display" style={{ fontSize: 17, fontWeight: 600 }}>
              {currentTrack ? (currentTrack.description || "지금 흐르는 곡") : "GM이 트랙을 선택하길 기다리는 중…"}
            </div>
          </div>
        </div>

        <div className="progress-track" style={{ width: "100%", marginBottom: 24 }}>
          <div className="progress-fill" style={{ width: duration ? `${Math.min(100, (elapsed / duration) * 100)}%` : "0%" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 220 }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>🔊</span>
          <input
            type="range"
            className="seekbar"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>

        <div style={{ marginTop: 30, fontSize: 11, color: "var(--text-faint)", textAlign: "center", lineHeight: 1.6 }}>
          재생목록과 트랙 상세 정보는 GM에게만 보여요.
        </div>
      </main>
    </div>
  );
}

/* ============================================================
   App 루트
   ============================================================ */

export default function App() {
  const [screen, setScreen] = useState("home");
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null);
  const [gmKey, setGmKey] = useState(null);

  function enterRoom(id, r, key) {
    setRoomId(id);
    setRole(r);
    setGmKey(key);
    setScreen("room");
  }
  function exitRoom() {
    setScreen("home");
    setRoomId(null);
    setRole(null);
    setGmKey(null);
  }

  if (screen === "room" && roomId) {
    return <Room key={roomId + role} roomId={roomId} role={role} gmKey={gmKey} onExit={exitRoom} />;
  }
  return <Home onEnterRoom={enterRoom} />;
}
