import { useQuery } from "@apollo/client";
import { SUGGESTIONS } from "../graphql/watch";

// Renders a <datalist> of existing DB values for a field; pair with an input's
// `list={id}`. Auto-suggest, no external dep.
export function SuggestDatalist({ id, field }: { id: string; field: string }) {
  const { data } = useQuery(SUGGESTIONS, { variables: { field }, fetchPolicy: "cache-first" });
  return (
    <datalist id={id}>
      {(data?.suggestions ?? []).map((v: string) => <option key={v} value={v} />)}
    </datalist>
  );
}
