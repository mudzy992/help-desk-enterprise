import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getAgentCollaborationConfiguration,
  type AgentCollaborationConfiguration,
} from "@/services/tickets-agent-collaboration-api";

const disabled: AgentCollaborationConfiguration = {
  presenceEnabled: false,
  presenceShowToRequester: false,
  collisionWarningEnabled: false,
  mentionsEnabled: false,
  followersEnabled: false,
  linksEnabled: false,
  linksMaxPerTicket: 20,
};

/** Paket 2.4: the collaboration switches; everything off until the answer arrives. */
export function useAgentCollaborationConfiguration(): AgentCollaborationConfiguration {
  const query = useQuery({
    queryKey: queryKeys.agentCollaborationConfiguration,
    queryFn: getAgentCollaborationConfiguration,
    staleTime: 60_000,
  });
  return query.data ?? disabled;
}
