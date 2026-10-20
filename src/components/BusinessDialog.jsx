import { useEffect, useRef } from 'react';
import { formatAddress, hoursLines, prettyKind, safeUrl } from '../lib/format.js';
import { DEFAULT_RECORD, PAYMENT_OPTIONS, VISIT_OPTIONS } from '../lib/records.js';

/** Details + visit tracking for one business. Notes are saved in this browser only. */
export default function BusinessDialog({ item, record, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [item?.key]);

  if (!item) return null;
  const r = { ...DEFAULT_RECORD, ...record };
  const website = safeUrl(item.website);
  const hours = hoursLines(item.hours);

  return (
    <dialog
      ref={ref}
      className="business-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // click on the backdrop
      }}
    >
      <form method="dialog" className="dialog-form" onSubmit={(e) => e.preventDefault()}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">BUSINESS DETAILS</p>
            <h2>{item.name}</h2>
            <p className="dialog-address">
              {prettyKind(item.kind)} · {formatAddress(item) || 'Address not listed'}
            </p>
          </div>
          <button type="button" className="close-button" aria-label="Close" onClick={() => ref.current?.close()}>
            ×
          </button>
        </div>

        {(hours.length > 0 || website || item.phone) && (
          <dl className="dialog-facts">
            {hours.length > 0 && (
              <>
                <dt>Opening hours</dt>
                <dd>
                  {hours.map((h) => (
                    <span key={h} className="hours-line">
                      {h}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {website && (
              <>
                <dt>Website</dt>
                <dd>
                  <a href={website} target="_blank" rel="noopener noreferrer">
                    {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </dd>
              </>
            )}
            {item.phone && (
              <>
                <dt>Phone</dt>
                <dd>{item.phone}</dd>
              </>
            )}
          </dl>
        )}

        <div className="dialog-links">
          <a
            className="button button-primary"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`}
          >
            Get directions
          </a>
          {item.sourceUrl && (
            <a className="text-link" target="_blank" rel="noopener noreferrer" href={item.sourceUrl}>
              Source record ↗
            </a>
          )}
        </div>

        <label htmlFor="payment-status">Payment method (ask and verify in person)</label>
        <select id="payment-status" value={r.payment} onChange={(e) => onChange({ payment: e.target.value })}>
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="visit-status">Visit status</label>
        <select id="visit-status" value={r.visit} onChange={(e) => onChange({ visit: e.target.value })}>
          {VISIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="business-notes">Notes</label>
        <textarea
          id="business-notes"
          rows={4}
          maxLength={1000}
          value={r.notes}
          placeholder="Contact name, best time to visit, or follow-up details"
          onChange={(e) => onChange({ notes: e.target.value })}
        />
        <p className="privacy-note">Your notes and visit records are saved only in this browser on this device.</p>
      </form>
    </dialog>
  );
}
