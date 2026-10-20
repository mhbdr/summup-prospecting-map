import { useEffect, useRef } from 'react';
import { formatAddress, formatDistance, prettyKind } from '../lib/format.js';
import { visitLabel } from '../lib/records.js';

const domId = (key) => 'biz-' + key.replace(/[^a-z0-9]/gi, '_');

/** Side list of the businesses inside the current map view. Clicking one zooms to its marker. */
export default function BusinessList({ items, selectedKey, records, distances, onPick }) {
  const listRef = useRef(null);

  // Keep the selected row visible when the selection came from the map.
  useEffect(() => {
    if (!selectedKey || !listRef.current) return;
    const row = listRef.current.querySelector('#' + domId(selectedKey));
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedKey]);

  return (
    <ul className="business-list" ref={listRef}>
      {items.map((item) => {
        const record = records[item.key];
        const verified = record && record.payment && record.payment !== 'unknown';
        return (
          <li key={item.key}>
            <button
              id={domId(item.key)}
              type="button"
              className={`business-card${item.key === selectedKey ? ' is-active' : ''}`}
              onClick={() => onPick(item.key)}
            >
              <span className="card-heading">
                <strong>{item.name}</strong>
                {distances?.has(item.key) && <span className="card-distance">{formatDistance(distances.get(item.key))}</span>}
              </span>
              <span className="card-type">
                {prettyKind(item.kind)} · {item.source}
              </span>
              <span className="card-meta">
                <span>{formatAddress(item) || 'Address not listed'}</span>
                <span className={`visit-chip visit-${record?.visit || 'not-visited'}`}>
                  {verified ? 'Payment verified · ' : ''}
                  {visitLabel(record?.visit)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
