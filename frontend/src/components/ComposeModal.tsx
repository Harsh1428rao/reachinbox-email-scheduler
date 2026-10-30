import React, { useState } from 'react';
import Papa from 'papaparse';
import { X, UploadCloud, Calendar, Clock } from 'lucide-react';
import axios from 'axios';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess, token }) => {
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [delayBetweenMs, setDelayBetweenMs] = useState(2000);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        complete: (results: any) => {
          const extracted: string[] = [];
          results.data.forEach((row: any) => {
            const rowValues = Object.values(row);
            rowValues.forEach((val: any) => {
              if (typeof val === 'string' && val.includes('@')) {
                extracted.push(val.trim());
              }
            });
          });
          setEmails(Array.from(new Set(extracted)));
        }
      });
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(
        'http://localhost:5000/api/emails/schedule',
        {
          recipientEmails: emails,
          subject,
          bodyText,
          scheduledStartTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
          delayBetweenMs
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Scheduling failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Compose Automated Sequence</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSchedule} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Upload Lead CSV</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-indigo-400 transition cursor-pointer">
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="csv-upload" />
              <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                <UploadCloud className="text-indigo-600 mb-1" size={28} />
                <span className="text-sm font-medium text-gray-700">Click to import recipients</span>
                <span className="text-xs text-gray-400 mt-1">{emails.length} valid email addresses detected</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Subject</label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Quick question regarding Outbox scale"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Email Body</label>
            <textarea
              required
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Hi {{name}}, wanted to connect..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1 flex items-center gap-1">
                <Calendar size={14} /> Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1 flex items-center gap-1">
                <Clock size={14} /> Delay Between (ms)
              </label>
              <input
                type="number"
                min="500"
                step="500"
                value={delayBetweenMs}
                onChange={(e) => setDelayBetweenMs(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || emails.length === 0}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {loading ? 'Submitting to Queue...' : `Schedule ${emails.length} Emails`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
