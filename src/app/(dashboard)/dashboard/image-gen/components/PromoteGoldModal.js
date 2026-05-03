"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import Button from "@/shared/components/Button";

const ROOMS = ["living", "bedroom", "child", "worship", "kitchen", "bath", "office"];

export default function PromoteGoldModal({ entry, onClose, onSuccess }) {
  const [room, setRoom] = useState(entry.room || "living");
  const [style, setStyle] = useState(entry.style || "");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/image-gen/promote-gold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: entry.output,
          room,
          style: style.trim(),
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Promote thất bại");
        setLoading(false);
        return;
      }
      onSuccess(data.destPath);
    } catch (err) {
      setError(err.message || "Promote thất bại");
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      title="Promote to Gold Library"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Copy ảnh hiện tại vào gold library để dùng làm reference cho future gens.
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase font-semibold text-text-muted" htmlFor="promote-room">Room</label>
          <select
            id="promote-room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="px-3 py-2 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
          >
            {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase font-semibold text-text-muted" htmlFor="promote-style">Style (alphanumeric, hyphen)</label>
          <input
            id="promote-style"
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            pattern="^[a-zA-Z0-9-]+$"
            required
            className="px-3 py-2 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
            placeholder="modern"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase font-semibold text-text-muted" htmlFor="promote-label">Label (optional, default = timestamp)</label>
          <input
            id="promote-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            pattern="^[a-zA-Z0-9-]*$"
            className="px-3 py-2 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
            placeholder="v3-seed"
          />
          <span className="text-[11px] text-text-muted">
            File sẽ thành <code className="font-mono">{room}/{style || "<style>"}-{label || "<ts>"}.png</code>
          </span>
        </div>

        {error && (
          <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" loading={loading} icon="star">
            Promote
          </Button>
        </div>
      </form>
    </Modal>
  );
}

PromoteGoldModal.propTypes = {
  entry: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};
