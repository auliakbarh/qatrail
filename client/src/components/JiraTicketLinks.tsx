import { Fragment } from "react";

// Renders JIRA ticket keys. If a base URL is known each key links to
// {baseUrl}/browse/{KEY} in a new tab; otherwise plain text. `max` shows the
// first N keys + "+rest" (list-cell use); omit to show all (detail use).
export function JiraTicketLinks({
  tickets,
  baseUrl,
  max,
}: {
  tickets: string[];
  baseUrl?: string | null;
  max?: number;
}) {
  if (!tickets.length) return <>—</>;
  const shown = max ? tickets.slice(0, max) : tickets;
  return (
    <span title={tickets.join(", ")} className="inline-flex flex-wrap gap-x-1">
      {shown.map((k, i) => (
        <Fragment key={k}>
          {baseUrl ? (
            <a
              href={`${baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(k)}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {k}
            </a>
          ) : (
            <span>{k}</span>
          )}
          {i < shown.length - 1 && ","}
        </Fragment>
      ))}
      {max && tickets.length > max && ` +${tickets.length - max}`}
    </span>
  );
}
