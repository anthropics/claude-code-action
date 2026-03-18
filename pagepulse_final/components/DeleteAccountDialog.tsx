"use client";

import { useState } from "react";

interface DeleteAccountDialogProps {
  onConfirm: () => void;
}

export default function DeleteAccountDialog({
  onConfirm,
}: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    onConfirm();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-800 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950"
      >
        Delete Account
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-lg font-semibold text-white">Delete Account</h3>
        <p className="mt-2 text-sm text-gray-400">
          This action is permanent and cannot be undone. All your data,
          analyses, and API keys will be permanently deleted.
        </p>
        <p className="mt-4 text-sm text-gray-300">
          Type <span className="font-mono font-bold text-red-400">DELETE</span>{" "}
          to confirm:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          placeholder="Type DELETE"
          autoFocus
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => {
              setOpen(false);
              setConfirmText("");
            }}
            className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || deleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete My Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
