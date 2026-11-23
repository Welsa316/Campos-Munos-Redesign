// Where a lead came from, when they arrived by a campaign link: the utm_ tags
// the website remembered and the API stored with the lead
// (server/utils/attribution.js). Pure, so it is tested in
// admin/test/campaignText.test.js.
//
// The values are whatever the person who built the link typed, shown as they
// are. A lead with no source and no campaign did not come by a tagged link.

const text = (v) => (typeof v === 'string' ? v.trim() : '')

/** The lines to show, in order, as [{ key, value }]; [] for a lead with no campaign link. */
export function campaignRows(row) {
  const source = text(row?.utm_source)
  const campaign = text(row?.utm_campaign)
  if (!source && !campaign) return []
  return [
    { key: 'from', value: [source, text(row.utm_medium)].filter(Boolean).join(' / ') },
    { key: 'campaign', value: campaign },
    { key: 'ad', value: text(row.utm_content) },
    { key: 'keyword', value: text(row.utm_term) },
    { key: 'page', value: text(row.landing_path) },
  ].filter((r) => r.value)
}

/** The same on one line ("youtube / paid_video · daca-nov · /servicios/daca"), or ''. */
export const campaignLine = (row) => campaignRows(row).map((r) => r.value).join(' · ')
